import { createCompatibleClient, safeCompatibleError, type RequestBudget } from "./compatible-transport.ts";
import type { ResponseCreateParamsNonStreaming, ResponseOutputItem } from "openai/resources/responses/responses";
import { assertResponsesConfig, type ResponsesConfig } from "./responses-config.ts";
import { AgentRunError, record } from "./run-contract.ts";
import type { AgentModelUsage } from "./model-provider.ts";

export function safeResponsesError(error: unknown): AgentRunError { return safeCompatibleError(error, "responses"); }
export type ResponsesBudget = RequestBudget;
export function createResponsesTransport(config: ResponsesConfig, fetcher: typeof fetch = fetch, budget?: ResponsesBudget) {
  assertResponsesConfig(config);
  const client = createCompatibleClient(config, fetcher, budget);
  return { async create(request: ResponseCreateParamsNonStreaming, options: { signal: AbortSignal; timeout: number; maxRetries: 0 }) {
    try {
      const data = await client.responses.create({ ...request, model: config.model, store: false,
        ...(config.reasoning === "encrypted" ? { include: ["reasoning.encrypted_content"] } : {}) }, { ...options, timeout: Math.min(options.timeout, 15000), maxRetries: 0 });
      const parsed = validateResponsesEnvelope(data, config.reasoning);
      return parsed;
    } catch (error) { if (options.signal.aborted) throw new AgentRunError("AGENT_ABORTED");
      if (error instanceof AgentRunError && error.code === "AGENT_INVALID_INPUT") throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
      throw safeResponsesError(error); }
  } };
}
function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.length || value.length > maximum) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
  return value;
}
/** Rebuild protocol items, including opaque continuation, in private adapter memory only. */
export function validateResponsesEnvelope(value: unknown, reasoning: ResponsesConfig["reasoning"]) {
  const r = record(value);
  if (r.status === "incomplete") throw new AgentRunError("AGENT_RESPONSES_INCOMPLETE");
  if (r.status === "failed" || r.error) throw new AgentRunError("AGENT_RESPONSES_FAILED");
  if (r.status !== "completed" || !Array.isArray(r.output) || !r.output.length || r.output.length > 32) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
  const output: ResponseOutputItem[] = r.output.map((raw) => {
    const item = record(raw);
    if (item.type === "function_call" && item.status !== undefined && item.status !== "completed") throw new AgentRunError("AGENT_RESPONSES_INCOMPLETE");
    if (item.type === "function_call") return { type: "function_call", call_id: boundedString(item.call_id, 80), name: boundedString(item.name, 100), arguments: boundedString(item.arguments, 2048),
      ...(item.id === undefined ? {} : { id: boundedString(item.id, 128) }) };
    if (item.type === "reasoning") {
      if (reasoning !== "encrypted" || typeof item.encrypted_content !== "string" || !item.encrypted_content) throw new AgentRunError("AGENT_RESPONSES_CONTINUATION_UNSUPPORTED");
      if (!Array.isArray(item.summary) || item.summary.length || (item.content !== undefined && (!Array.isArray(item.content) || item.content.length))) throw new AgentRunError("AGENT_RESPONSES_CONTINUATION_UNSUPPORTED");
      return { type: "reasoning", id: boundedString(item.id, 128), encrypted_content: boundedString(item.encrypted_content, 65536), summary: [] };
    }
    if (item.type !== "message" || item.role !== "assistant" || item.status !== "completed" || !Array.isArray(item.content)) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
    const content = item.content.map((rawContent) => {
      const c = record(rawContent);
      if (c.type === "refusal") throw new AgentRunError("AGENT_RESPONSES_REFUSAL");
      if (c.type !== "output_text") throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
      return { type: "output_text" as const, text: boundedString(c.text, 12000), annotations: [] };
    });
    const phase = item.phase;
    if (phase !== undefined && phase !== null && phase !== "commentary" && phase !== "final_answer") throw new AgentRunError("AGENT_RESPONSES_CONTINUATION_UNSUPPORTED");
    return { type: "message", role: "assistant", status: "completed", id: boundedString(item.id, 128), content, ...(phase === undefined ? {} : { phase }) };
  });
  let usage: AgentModelUsage | undefined;
  if (r.usage !== undefined && r.usage !== null) {
    const u = record(r.usage);
    for (const key of ["input_tokens", "output_tokens", "total_tokens"]) if (!Number.isSafeInteger(u[key]) || Number(u[key]) < 0) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
    usage = { inputTokens: Number(u.input_tokens), outputTokens: Number(u.output_tokens), totalTokens: Number(u.total_tokens) };
  }
  const model = typeof r.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(r.model) ? r.model : undefined;
  return { output, usage, model };
}
