import "server-only";
import { createHash } from "node:crypto";
import { isIssuedActor, type ActorContext } from "./execution-context.ts";
import type { AgentContextSnapshot } from "./context-contract.ts";
import { AgentRunError } from "./run-contract.ts";
import { parsePreviewInput, type PreviewRotation, type PreviewResult } from "./preview-contract.ts";
import type { executePlanning, PlanningBody } from "../planning-service.ts";
import type { PlanningActor } from "../planning-actor.ts";
import { createSafeCurrentPlanSnapshot } from "./context-contract.ts";
export type PreviewAccess = Readonly<{ baseRevision: string; rotationProfile: PreviewRotation }>;
type Binding = { actor: ActorContext; snapshotHash: string; snapshot: AgentContextSnapshot; body: PlanningBody; planningActor: PlanningActor; ip: string; execute: typeof executePlanning; used: boolean };
const bindings = new WeakMap<PreviewAccess, Binding>();
const fingerprint = (snapshot: AgentContextSnapshot) => createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
export function issuePreviewAccess(input: Omit<Binding, "used" | "snapshotHash"> & { rotationProfile: PreviewRotation; baseRevision: string }): PreviewAccess {
  if (!isIssuedActor(input.actor) || input.actor.userId !== input.planningActor.userId) throw new AgentRunError("AGENT_TOOL_FORBIDDEN");
  const access = Object.freeze({ baseRevision: input.baseRevision, rotationProfile: input.rotationProfile });
  bindings.set(access, { ...input, snapshot: structuredClone(input.snapshot), body: structuredClone(input.body), snapshotHash: fingerprint(input.snapshot), used: false });
  return access;
}
export function canPreview(access: PreviewAccess | undefined, actor: ActorContext | null, snapshot: AgentContextSnapshot | null): boolean {
  const binding = access && bindings.get(access);
  return Boolean(binding && isIssuedActor(actor) && actor === binding.actor && snapshot && fingerprint(snapshot) === binding.snapshotHash);
}
export async function computePreview(access: PreviewAccess, actor: ActorContext | null, snapshot: AgentContextSnapshot | null, raw: unknown, signal: AbortSignal): Promise<PreviewResult> {
  if (!canPreview(access, actor, snapshot)) throw new AgentRunError("AGENT_PREVIEW_CONTEXT_STALE_OR_FORBIDDEN");
  const args = parsePreviewInput(raw); const binding = bindings.get(access)!;
  if (args.baseRevision !== access.baseRevision) throw new AgentRunError("AGENT_PREVIEW_STALE_REVISION");
  if (args.rotationProfile !== access.rotationProfile) throw new AgentRunError("AGENT_PREVIEW_ASSUMPTION_MISMATCH");
  signal.throwIfAborted();
  if (binding.used) throw new AgentRunError("AGENT_PREVIEW_BUDGET_EXCEEDED");
  binding.used = true; // Includes failed, timed-out and cancelled attempts. No retry.
  const base = binding.snapshot.currentPlan;
  const result: PreviewResult = { status: "unavailable", semantics: "PREVIEW_ONLY", saved: "NOT_SAVED", applied: "NOT_APPLIED",
    assumptions: { rotationProfile: args.rotationProfile, candidates: 1, data: "SYNTHETIC" }, baseRevision: access.baseRevision, currentRevision: binding.snapshot.contextRevision,
    source: { type: "planning_preview", engine: "synthetic_mock_solver", contextRevision: binding.snapshot.contextRevision, sampledAt: binding.snapshot.sampledAt },
    computedAt: new Date().toISOString(), cacheHit: false, summary: null, differences: null, issue: { code: "AGENT_PREVIEW_SOLVER_FAILED" },
    limitations: ["SYNTHETIC_MOCK_SOLVER_NOT_OPTIMALITY_EVIDENCE", "ROTATION_CHANGE_ONLY", "NO_DRONE_OR_ESTIMATED_PRODUCTION_COMPARISON"], truncation: { applied: false, omittedCount: 0 } };
  try {
    const computed = await binding.execute({ body: { ...binding.body, rotation: args.rotationProfile }, actor: binding.planningActor, ip: binding.ip, requestId: binding.actor.requestId, signal });
    signal.throwIfAborted();
    const preview = createSafeCurrentPlanSnapshot({ plan: computed.result, layout: binding.body.layout! });
    if (!base || preview.profile.rotationProfile !== args.rotationProfile) throw new AgentRunError("AGENT_PREVIEW_INVALID_RESULT");
    const currentLmd = base.production.source === "solver" ? base.production.values.lmd : null;
    const previewLmd = preview.production.source === "solver" ? preview.production.values.lmd : null;
    result.status = "ok"; result.issue = null; result.cacheHit = computed.cacheHit;
    result.summary = { shiftCount: preview.shifts.length, lmd: previewLmd };
    result.differences = { shiftCount: { current: base.shifts.length, preview: preview.shifts.length, delta: preview.shifts.length - base.shifts.length },
      lmd: { current: currentLmd, preview: previewLmd, delta: currentLmd === null || previewLmd === null ? null : previewLmd - currentLmd } };
  } catch { if (signal.aborted) throw new AgentRunError("AGENT_ABORTED"); }
  result.computedAt = new Date().toISOString(); return result;
}
