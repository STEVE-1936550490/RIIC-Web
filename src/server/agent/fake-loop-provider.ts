import { requestedPreview, parsePreviewResult } from "./preview-contract.ts";
import { assertModelEgress } from "./egress-policy.ts";
import { record, type AgentFinalResult } from "./run-contract.ts";
import type { LoopProvider, LoopRequest, LoopDecision } from "./loop-provider.ts";
export class ScriptedLoopProvider implements LoopProvider {
  readonly kind = "fake";
  private index = 0;
  private readonly script: Array<LoopDecision | Error | ((request: LoopRequest) => Promise<LoopDecision>)>;
  constructor(script: Array<LoopDecision | Error | ((request: LoopRequest) => Promise<LoopDecision>)>) { this.script = script; }
  async next(request: LoopRequest) {
    assertModelEgress(this.kind, request.egress); request.signal.throwIfAborted();
    const step = this.script[this.index++];
    if (step instanceof Error) throw step;
    if (!step) throw new Error("FAKE_SCRIPT_EXHAUSTED");
    return { decision: typeof step === "function" ? await step(request) : step };
  }
}
/** Explicit local test command grammar; not presented as an intelligent model. */
export class LocalDemoProvider implements LoopProvider {
  readonly kind = "fake";
  async next(request: LoopRequest) {
    assertModelEgress(this.kind, request.egress); request.signal.throwIfAborted();
    if (request.observations.length) {
      const last = request.observations.at(-1)!;
      const result = record(last.result);
      if (last.call.name === "plan.preview") {
        const preview = parsePreviewResult(result);
        return { decision: { type: "final", answer: preview.status === "ok" ? `FAKE / TEST — 试算完成；未保存、未应用。 PREVIEW_ONLY / NOT_SAVED / NOT_APPLIED. differences: ${JSON.stringify(preview.differences)}` : "FAKE / TEST — 试算失败，未生成候选方案；未保存、未应用。" } };
      }
      let facts = `status: ${result.status}`;
      if (result.status === "ok" && last.call.name === "current_plan.get_summary") facts += `; shiftCount: ${record(result.data).shiftCount}`;
      if (result.status === "ok" && last.call.name === "current_plan.get_room_detail") {
        const data = record(result.data); const planned = record(data.planned); const observed = record(data.observed);
        facts += `; room: ${record(data.room).roomId}; shiftIndex: ${record(data.shift).resolvedShiftIndex}; planned: ${JSON.stringify(planned.operators)}; observed: ${observed.status === "available" ? JSON.stringify(observed.operators) : "unavailable"}`;
      }
      if (result.status === "ok" && last.call.name === "saved_plan.list" && Array.isArray(result.plans)) facts += `; candidates: ${result.plans.map((plan) => { const p = record(plan); return `${p.title} [${p.id}]`; }).join(", ")}`;
      if (result.status === "ok" && last.call.name === "saved_plan.compare") {
        const data = record(result.data); const metrics = record(data.production).metrics;
        facts += `; hasKnownDifferences: ${data.hasKnownDifferences}; natural24h: ${JSON.stringify(metrics)}`;
      }
      return { decision: { type: "final", answer: `FAKE / TEST — ${facts}` } };
    }
    const message = request.message.trim();
    const rotationProfile = requestedPreview(message);
    const previewTool = request.tools.find((tool) => tool.name === "plan.preview");
    if (rotationProfile && previewTool) {
      const baseRevision = /Base revision: (.*?)\. Requested rotation:/.exec(previewTool.description)?.[1];
      return { decision: { type: "calls", calls: [{ id: "local-preview-1", name: "plan.preview", arguments: { baseRevision, rotationProfile } }] } };
    }
    let name = ""; let args: unknown = {};
    if (/^(summary|解释当前方案)$/i.test(message)) name = "current_plan.get_summary";
    const room = /^(?:room|房间)\s+(.+?)(?:\s+@([0-9]+))?$/i.exec(message);
    if (room) { name = "current_plan.get_room_detail"; args = { roomRef: room[1], shiftIndex: room[2] === undefined ? null : Number(room[2]) }; }
    const list = /^(?:list|已存方案)(?:\s+(.+))?$/i.exec(message);
    if (list) { name = "saved_plan.list"; args = { query: list[1] ?? null }; }
    const compare = /^(?:compare|比较)\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9_-]+)$/i.exec(message);
    if (compare) { name = "saved_plan.compare"; args = { leftPlanId: compare[1], rightPlanId: compare[2] }; }
    if (!name) return { decision: { type: "final", answer: "FAKE / TEST：仅支持 summary、room <引用> [@0-based班次]、list [标题]、compare <ID> <ID>。不支持写入。" } };
    return { decision: { type: "calls", calls: [{ id: "local-call-1", name, arguments: args }] } };
  }
}
// Type-only marker keeps the public mode vocabulary aligned with the UI contract.
export type LocalDemoMode = Extract<AgentFinalResult["modelMode"], "fake_test">;
