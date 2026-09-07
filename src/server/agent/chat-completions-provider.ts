import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import { assertModelEgress } from "./egress-policy.ts";
import { AgentRunError } from "./run-contract.ts";
import { parseLoopDecision, type LoopProvider, type LoopRequest } from "./loop-provider.ts";
import { createChatCompletionsTransport, type ChatCompletionsConfig } from "./chat-completions-transport.ts";
import type { AgentModelProvider, AgentModelRequest } from "./model-provider.ts";
import { READ_ONLY_ADVISOR_INSTRUCTIONS } from "./provider-instructions.ts";

type Transport = ReturnType<typeof createChatCompletionsTransport>;
/** Protocol history only. Business authorization, tools, budgets and sources stay in the shared loop. */
class ChatCompletionsLoopProvider implements LoopProvider {
  readonly kind = "external";
  private history: ChatCompletionMessageParam[] = [];
  private consumed: string[] = [];
  private pending = new Map<string, string>();
  private seen = new Set<string>();
  private run: string | undefined;
  private initial: string | undefined;
  private busy = false;
  private closed = false;
  private config: ChatCompletionsConfig;
  private transport: Transport;
  constructor(config: ChatCompletionsConfig, transport: Transport) { this.config = config; this.transport = transport; }
  async next(request: LoopRequest) {
    assertModelEgress(this.kind, request.egress);
    if (request.signal.aborted) throw new AgentRunError("AGENT_ABORTED");
    const run = request.runId ?? request.message;
    if (this.closed || this.busy || (this.run !== undefined && this.run !== run)) throw new AgentRunError("AGENT_CHAT_RUN_REUSE");
    this.run = run; this.busy = true;
    try {
      const initial = JSON.stringify([request.message, request.tools]);
      if (this.initial !== undefined && this.initial !== initial) throw new AgentRunError("AGENT_CHAT_HISTORY_INVALID");
      this.initial = initial;
      if (!this.history.length) this.history = [{ role: "system", content: READ_ONLY_ADVISOR_INSTRUCTIONS }, { role: "user", content: request.message }];
      if (request.observations.length < this.consumed.length || this.consumed.some((value, i) => value !== JSON.stringify(request.observations[i]))) throw new AgentRunError("AGENT_CHAT_HISTORY_INVALID");
      for (const observation of request.observations.slice(this.consumed.length)) {
        if (this.pending.get(observation.call.id) !== JSON.stringify(observation.call)) throw new AgentRunError("AGENT_CHAT_HISTORY_INVALID");
        this.pending.delete(observation.call.id);
        this.history.push({ role: "tool", tool_call_id: observation.call.id, content: JSON.stringify(observation.result) });
        this.consumed.push(JSON.stringify(observation));
      }
      if (this.pending.size) throw new AgentRunError("AGENT_CHAT_HISTORY_INVALID");
      const aliases = new Map(request.tools.map((tool) => [tool.name.replaceAll(".", "__"), tool.name]));
      if (aliases.size !== request.tools.length) throw new AgentRunError("AGENT_CHAT_ALIAS_COLLISION");
      const response = await this.transport.create({ model: this.config.model, messages: structuredClone(this.history), store: false, max_completion_tokens: 1800,
        tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name.replaceAll(".", "__"), description: tool.description, parameters: tool.inputSchema, strict: true } })),
        tool_choice: "auto",
      }, { signal: request.signal, timeout: 15000, maxRetries: 0 });
      if (request.signal.aborted) throw new AgentRunError("AGENT_ABORTED");
      const calls = response.calls.map((call) => {
        const name = aliases.get(call.function.name);
        if (!name || this.seen.has(call.id)) throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT");
        const result = { id: call.id, name, arguments: JSON.parse(call.function.arguments) as unknown };
        this.seen.add(call.id); this.pending.set(call.id, JSON.stringify(result));
        return result;
      });
      const decision = parseLoopDecision(calls.length ? { type: "calls", calls } : { type: "final", answer: response.content });
      this.history.push(response.message);
      if (decision.type === "final") { this.closed = true; this.history = []; this.consumed = []; }
      return { decision, usage: response.usage };
    } catch (error) {
      this.closed = true; this.history = []; this.consumed = []; this.pending.clear();
      if (error instanceof AgentRunError) throw error;
      throw new AgentRunError("AGENT_PROVIDER_ERROR");
    } finally { this.busy = false; }
  }
}
export function createChatCompletionsLoopProvider(config: ChatCompletionsConfig, transport = createChatCompletionsTransport(config)): LoopProvider {
  return new ChatCompletionsLoopProvider(config, transport);
}
export function createChatCompletionsModelProvider(config: ChatCompletionsConfig, transport = createChatCompletionsTransport(config)): AgentModelProvider {
  return { async generateStructuredOutput(request: AgentModelRequest) {
    assertModelEgress("external", request.egress ?? { classification: "user_business_context", localTestApproved: false });
    if (request.signal.aborted) throw new AgentRunError("AGENT_ABORTED");
    const startedAt = performance.now();
    const result = await transport.create({ model: config.model, messages: request.messages.map(({ role, content }) => ({ role, content })),
      response_format: { type: "json_schema", json_schema: { name: request.structuredOutput.name, schema: request.structuredOutput.schema, strict: true } },
      max_completion_tokens: request.maxOutputTokens ?? 1800, store: false,
    }, { signal: request.signal, timeout: request.timeoutMs, maxRetries: 0 });
    if (result.calls.length || !result.content) throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE");
    let output: unknown; try { output = JSON.parse(result.content); } catch { throw new AgentRunError("AGENT_CHAT_INVALID_RESPONSE"); }
    return { output, metadata: { provider: "chat_completions_compatible", model: result.model, usage: result.usage, latencyMs: Math.max(0, performance.now() - startedAt) } };
  } };
}
