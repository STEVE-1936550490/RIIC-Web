import { parsePreviewResult, type PreviewResult } from "./preview-contract.ts";
// Shared wire contract. No server secrets, SDK objects or business payloads.
export const AGENT_RUN_LIMITS = Object.freeze({ steps: 5, calls: 6, toolMs: 5000, totalMs: 20000, resultBytes: 16384, observationBytes: 65536, tokens: 12000, answerChars: 3000 });
export class AgentRunError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "AgentRunError"; this.code = code; }
}
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new AgentRunError("AGENT_INVALID_INPUT");
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const item = record(value);
  if (Object.keys(item).length !== keys.length || keys.some((key) => !Object.hasOwn(item, key))) throw new AgentRunError("AGENT_INVALID_INPUT");
  return item;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AgentRunError("AGENT_INVALID_INPUT");
  return value.trim();
}
export type AgentSource = { type: "current_context" | "saved_plan" | "observed_schedule" | "planning_preview"; contextRevision: string | null; planDiagnosticId: string | null; sampledAt: string | null; updatedAt: string | null; planId: string | null };
export type ToolTrace = { name: string; step: number; status: string; latencyMs: number; code: string | null };
export type AgentFinalResult = {
  preview?: PreviewResult;
  status: "ok" | "failed"; answer: string; runId: string; contextRevision: string | null;
  modelMode: "fake_test" | "external"; intent: null; sources: AgentSource[]; limitations: string[];
  tools: ToolTrace[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; error: string | null;
};
export function isAgentResultCurrent(result: Pick<AgentFinalResult, "contextRevision">, revision: string): boolean { return result.contextRevision === revision; }

export function parseAgentFinalResult(value: unknown): AgentFinalResult {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 16384) throw new AgentRunError("AGENT_INVALID_OUTPUT");
  const r = exact(value, ["status", "answer", "runId", "contextRevision", "modelMode", "intent", "sources", "limitations", "tools", "usage", "error", ...(Object.hasOwn(record(value), "preview") ? ["preview"] : [])]);
  if ((r.status !== "ok" && r.status !== "failed") || (r.modelMode !== "fake_test" && r.modelMode !== "external") || r.intent !== null) throw new AgentRunError("AGENT_INVALID_OUTPUT");
  const list = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new AgentRunError("AGENT_INVALID_OUTPUT"); return v; };
  const nullable = (v: unknown, max: number) => v === null ? null : text(v, max);
  const number = (v: unknown) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new AgentRunError("AGENT_INVALID_OUTPUT"); return v; };
  const usage = exact(r.usage, ["inputTokens", "outputTokens", "totalTokens"]);
  const preview = r.preview === undefined ? undefined : parsePreviewResult(r.preview);
  if (preview && preview.currentRevision !== r.contextRevision) throw new AgentRunError("AGENT_INVALID_OUTPUT");
  return { ...(preview ? { preview } : {}), status: r.status, modelMode: r.modelMode, intent: null, answer: text(r.answer, 3000), runId: text(r.runId, 80), contextRevision: nullable(r.contextRevision, 80), error: nullable(r.error, 80),
    sources: list(r.sources, 60).map((raw): AgentSource => { const s = exact(raw, ["type", "contextRevision", "planDiagnosticId", "sampledAt", "updatedAt", "planId"]);
      if (s.type !== "current_context" && s.type !== "saved_plan" && s.type !== "observed_schedule" && s.type !== "planning_preview") throw new AgentRunError("AGENT_INVALID_OUTPUT");
      return { type: s.type, contextRevision: nullable(s.contextRevision, 80), planDiagnosticId: nullable(s.planDiagnosticId, 80), sampledAt: nullable(s.sampledAt, 40), updatedAt: nullable(s.updatedAt, 40), planId: nullable(s.planId, 128) }; }),
    limitations: list(r.limitations, 16).map((s) => text(s, 128)),
    tools: list(r.tools, 6).map((raw) => { const t = exact(raw, ["name", "step", "status", "latencyMs", "code"]); return { name: text(t.name, 100), step: number(t.step), status: text(t.status, 40), latencyMs: number(t.latencyMs), code: nullable(t.code, 80) }; }),
    usage: { inputTokens: number(usage.inputTokens), outputTokens: number(usage.outputTokens), totalTokens: number(usage.totalTokens) } };
}
