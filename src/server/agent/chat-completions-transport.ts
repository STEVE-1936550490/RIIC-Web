import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionAssistantMessageParam, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions/completions";
import { assertModelConfig, type ModelConfig } from "./compatible-config.ts";
import { createCompatibleClient, safeCompatibleError, type RequestBudget } from "./compatible-transport.ts";
import { AgentRunError, record } from "./run-contract.ts";
import type { AgentModelUsage } from "./model-provider.ts";

export type ChatCompletionsConfig = ModelConfig & { protocol: "chat_completions" };
function boundedString(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  return value;
}
export function validateChatEnvelope(value: unknown) {
  const r = record(value);
  if (r.object !== "chat.completion" || !Array.isArray(r.choices) || r.choices.length !== 1 || r.error) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  const choice = record(r.choices[0]); const msg = record(choice.message);
  if (choice.index !== 0 || msg.role !== "assistant") throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  if (choice.finish_reason === "length") throw new AgentRunError("AGENT_CHAT_INCOMPLETE");
  if (choice.finish_reason === "content_filter" || msg.refusal) throw new AgentRunError("AGENT_CHAT_REFUSAL");
  // Vendor-specific reasoning may require continuation. Never silently drop it to claim support.
  if (["reasoning", "reasoning_content", "reasoning_details", "function_call", "audio"].some((key) => msg[key] !== undefined && msg[key] !== null)) throw new AgentRunError("AGENT_CHAT_CONTINUATION_UNSUPPORTED");
  if (choice.finish_reason !== "stop" && choice.finish_reason !== "tool_calls") throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  const content = msg.content === null || msg.content === undefined ? null : boundedString(msg.content, 12000);
  let calls: ChatCompletionMessageFunctionToolCall[] = [];
  if (choice.finish_reason === "tool_calls") {
    if (!Array.isArray(msg.tool_calls) || !msg.tool_calls.length || msg.tool_calls.length > 8) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
    calls = msg.tool_calls.map((raw) => {
      const call = record(raw); const fn = record(call.function);
      if (call.type !== "function") throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
      const args = boundedString(fn.arguments, 2048);
      let parsed: unknown; try { parsed = JSON.parse(args); } catch { throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE"); }
      record(parsed);
      return { type: "function", id: boundedString(call.id, 80), function: { name: boundedString(fn.name, 100), arguments: args } };
    });
    if (new Set(calls.map((c) => c.id)).size !== calls.length) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  } else if (!content || (msg.tool_calls !== undefined && msg.tool_calls !== null && (!Array.isArray(msg.tool_calls) || msg.tool_calls.length))) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
  let usage: AgentModelUsage | undefined;
  if (r.usage !== undefined && r.usage !== null) {
    const u = record(r.usage);
    for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) if (!Number.isSafeInteger(u[key]) || Number(u[key]) < 0) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
    usage = { inputTokens: Number(u.prompt_tokens), outputTokens: Number(u.completion_tokens), totalTokens: Number(u.total_tokens) };
  }
  const model = typeof r.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(r.model) ? r.model : undefined;
  const message: ChatCompletionAssistantMessageParam = { role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) };
  return { message, calls, content, usage, model };
}
export function createChatCompletionsTransport(config: ChatCompletionsConfig, fetcher: typeof fetch = fetch, budget?: RequestBudget) {
  assertModelConfig(config);
  if (config.protocol !== "chat_completions" || config.reasoning !== "none") throw new AgentRunError("AGENT_CHAT_CONFIG_INVALID");
  const client = createCompatibleClient(config, fetcher, budget);
  return { async create(request: ChatCompletionCreateParamsNonStreaming, options: { signal: AbortSignal; timeout: number; maxRetries: 0 }) {
    try {
      const data = await client.chat.completions.create({ ...request, model: config.model, store: false, stream: false, n: 1,
        max_completion_tokens: Math.min(request.max_completion_tokens ?? 1800, 1800) }, { ...options, timeout: Math.min(options.timeout, 15000), maxRetries: 0 });
      return validateChatEnvelope(data);
    } catch (error) {
      if (options.signal.aborted) throw new AgentRunError("AGENT_ABORTED");
      if (error instanceof AgentRunError && error.code === "AGENT_INVALID_INPUT") throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
      throw safeCompatibleError(error, "chat_completions");
    }
  } };
}
