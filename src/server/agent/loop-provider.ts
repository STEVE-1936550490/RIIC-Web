import type { AgentModelUsage } from "./model-provider.ts";
import type { EgressContext, ProviderKind } from "./egress-policy.ts";
import type { visibleTools } from "./tool-registry.ts";
import { AgentRunError, exact, record, text } from "./run-contract.ts";
export type LoopCall = { id: string; name: string; arguments: unknown };
export type LoopObservation = { call: LoopCall; result: unknown };
export type LoopDecision = { type: "calls"; calls: LoopCall[] } | { type: "final"; answer: string };
export type LoopRequest = { message: string; tools: ReturnType<typeof visibleTools>; observations: LoopObservation[]; signal: AbortSignal; egress: EgressContext };
export interface LoopProvider { readonly kind: ProviderKind; next(request: LoopRequest): Promise<{ decision: unknown; usage?: AgentModelUsage }> }
export function parseLoopDecision(value: unknown): LoopDecision {
  const item = record(value);
  if (item.type === "final") { exact(value, ["type", "answer"]); return { type: "final", answer: text(item.answer, 3000) }; }
  if (item.type !== "calls" || !Array.isArray(item.calls) || !item.calls.length || item.calls.length > 8) throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT");
  exact(value, ["type", "calls"]);
  const calls = item.calls.map((raw) => {
    const call = exact(raw, ["id", "name", "arguments"]);
    if (new TextEncoder().encode(JSON.stringify(call.arguments)).length > 2048) throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT");
    return { id: text(call.id, 80), name: text(call.name, 100), arguments: call.arguments };
  });
  if (new Set(calls.map((c) => c.id)).size !== calls.length) throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT");
  return { type: "calls", calls };
}
