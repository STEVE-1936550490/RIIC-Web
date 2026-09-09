import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress, call, final } from "./m3-test-support.ts";
import { previewExample, previewExampleSnapshot } from "./preview-example.ts";
const { createPlanningService } = await import("../planning-service.ts");
const { syntheticPlanningDependencies, syntheticPreviewAccess } = await import("./synthetic-planning-preview.ts");
const { planningActorFromSession } = await import("../planning-actor.ts");
const { issuePreviewAccess } = await import("./planning-preview-access.ts");
const { executeRegisteredTool, visibleTools } = await import("./tool-registry.ts");
const { runReadOnlyAgent } = await import("./orchestrator.ts");
const { ScriptedLoopProvider, LocalDemoProvider } = await import("./fake-loop-provider.ts");
const { parseAgentFinalResult } = await import("./run-contract.ts");
const { handleAgentRequest, agentApiDependencies } = await import("./agent-api.ts");
const { __resetRequestGuardsForTests } = await import("../api-contract.ts");
const args = { baseRevision: "synthetic-rev-1", rotationProfile: "abc_12_6_6" };
function fixture(overrides: Partial<typeof syntheticPlanningDependencies> = {}) {
  __resetRequestGuardsForTests();
  const ctx = syntheticExecution(); ctx.snapshot.currentPlan = previewExampleSnapshot();
  const session = { user: { id: ctx.actor.userId } };
  const execute = createPlanningService({ ...syntheticPlanningDependencies, ...overrides });
  const preview = issuePreviewAccess({ actor: ctx.actor, snapshot: ctx.snapshot, baseRevision: "synthetic-rev-1", rotationProfile: "abc_12_6_6", execute,
    planningActor: planningActorFromSession(session), ip: "synthetic-ip", body: { layout: previewExample().calculationContext.layout, boxSource: "sample", fiammetta_enable: false } });
  return { ...ctx, preview, signal: new AbortController().signal };
}
test("preview visibility requires issued context; input is narrow and preserves four M0 read tools", async () => {
  assert.equal(visibleTools(syntheticExecution()).length, 4);
  const ctx = fixture(); const tools = visibleTools(ctx);
  assert.equal(tools.length, 5); assert.equal(tools.find(t => t.name === "plan.preview")?.effect, "compute");
  assert.equal(tools.filter(t => t.effect === "read").length, 4);
  for (const extra of [{ userId: "foreign" }, { actor: {} }, { workspace: {} }, { solverFlags: [] }, { candidates: 100 }, { signal: {} }]) {
    await assert.rejects(executeRegisteredTool("plan.preview", { ...args, ...extra }, ctx), { code: "AGENT_TOOL_INVALID_INPUT" });
  }
});
test("preview rejects forged actor, cross-user access, cloned permit, altered snapshot and stale revision", async () => {
  const ctx = fixture();
  for (const context of [{ ...ctx, actor: { ...ctx.actor } }, { ...ctx, actor: syntheticExecution().actor }, { ...ctx, preview: { ...ctx.preview } }, { ...ctx, snapshot: { ...ctx.snapshot, contextRevision: "changed" } }]) {
    await assert.rejects(executeRegisteredTool("plan.preview", args, context), { code: "AGENT_TOOL_FORBIDDEN" });
  }
  await assert.rejects(executeRegisteredTool("plan.preview", { ...args, baseRevision: "old" }, ctx), { code: "AGENT_PREVIEW_STALE_REVISION" });
  await assert.rejects(executeRegisteredTool("plan.preview", { ...args, rotationProfile: "abc_12_12_12" }, ctx), { code: "AGENT_PREVIEW_ASSUMPTION_MISMATCH" });
});
test("preview shares the service, projects public results and consumes exactly one computation without writes", async () => {
  let calls = 0; let records = 0;
  const ctx = fixture({ runPlan: async (...input) => { calls++; return { ...await syntheticPlanningDependencies.runPlan(...input), stdout: "PRIVATE", stderr: "PRIVATE" }; }, recordPlanRunBestEffort: async () => { records++; return true; } });
  const before = JSON.stringify(ctx.snapshot);
  const savedBefore = await ctx.savedPlans.list({ userId: ctx.actor.userId });
  const value = await executeRegisteredTool("plan.preview", args, ctx);
  assert.equal(value.status, "ok", JSON.stringify(value));
  assert.ok("differences" in value); assert.equal(value.differences?.lmd.delta, 20);
  assert.equal(value.differences?.shiftCount.delta, 1);
  assert.equal(JSON.stringify(ctx.snapshot), before); assert.equal(calls, 1); assert.equal(records, 1);
  assert.deepEqual(await ctx.savedPlans.list({ userId: ctx.actor.userId }), savedBefore);
  assert.equal(value.saved, "NOT_SAVED"); assert.equal(value.applied, "NOT_APPLIED");
  assert.ok(!JSON.stringify(value).includes("PRIVATE")); assert.ok(!JSON.stringify(value).includes("operbox"));
  await assert.rejects(executeRegisteredTool("plan.preview", args, ctx), { code: "AGENT_PREVIEW_BUDGET_EXCEEDED" });
  assert.equal(calls, 1);
});
test("missing and failed solver results are failures, never a generated preview", async () => {
  for (const result of [{ success: false }, { success: true }]) {
    const ctx = fixture({ runPlan: async () => result });
    const value = await executeRegisteredTool("plan.preview", args, ctx);
    assert.equal(value.status, "unavailable"); assert.ok("summary" in value && value.summary === null);
  }
});
test("fake model invokes preview for an explicit user request and reports deterministic differences, no apply", async () => {
  const result = await runReadOnlyAgent({ context: fixture(), message: "如果把轮换改成 abc_12_6_6，试算一下。", provider: new LocalDemoProvider(), egress: syntheticEgress });
  assert.equal(result.status, "ok", JSON.stringify(result)); assert.equal(result.tools[0].name, "plan.preview");
  assert.equal(result.preview?.differences?.lmd.delta, 20); assert.match(result.answer, /未保存、未应用/);
  assert.equal(result.sources[0].type, "planning_preview"); assert.deepEqual(parseAgentFinalResult(result), result);
});
test("model cannot turn solver failure or a skipped compute into success", async () => {
  const ctx = fixture({ runPlan: async () => ({ success: false }) });
  const result = await runReadOnlyAgent({ context: ctx, message: "preview abc_12_6_6", provider: new ScriptedLoopProvider([call("plan.preview", args), { type: "final", answer: "方案已生成" }]), egress: syntheticEgress });
  assert.equal(result.status, "failed"); assert.ok(!result.answer.includes("方案已生成"));
  const skipped = await runReadOnlyAgent({ context: fixture(), message: "preview abc_12_6_6", provider: new ScriptedLoopProvider([final]), egress: syntheticEgress });
  assert.equal(skipped.status, "failed");
});
test("one run cannot enumerate multiple previews or retry after timeout", async () => {
  let calls = 0;
  const ctx = fixture({ runPlan: async () => { calls++; return new Promise(() => {}); } });
  const result = await runReadOnlyAgent({ context: ctx, message: "preview abc_12_6_6", egress: syntheticEgress, deadlines: { toolMs: 10 },
    provider: new ScriptedLoopProvider([call("plan.preview", args), call("plan.preview", args, "second"), final]) });
  assert.equal(calls, 1); assert.equal(result.status, "failed"); assert.equal(result.tools[0].code, "AGENT_TOOL_TIMEOUT");
});
test("cancel before compute performs zero solver calls; cancel during compute ignores late result", async () => {
  let calls = 0;
  let finish: (() => void) | undefined;
  const ctx = fixture({ runPlan: async (...input) => { calls++; await new Promise<void>(resolve => { finish = resolve; }); return syntheticPlanningDependencies.runPlan(...input); } });
  const early = new AbortController(); early.abort();
  const rejected = await runReadOnlyAgent({ context: ctx, message: "preview abc_12_6_6", provider: new LocalDemoProvider(), egress: syntheticEgress, signal: early.signal });
  assert.equal(rejected.error, "AGENT_ABORTED"); assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = runReadOnlyAgent({ context: ctx, message: "preview abc_12_6_6", provider: new LocalDemoProvider(), egress: syntheticEgress, signal: controller.signal });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort(); const result = await pending; finish();
  assert.equal(result.error, "AGENT_ABORTED"); assert.equal(result.preview, undefined); assert.equal(calls, 1);
});
test("API → fake provider → preview → shared service uses only server synthetic data", async () => {
  __resetRequestGuardsForTests();
  const ctx = fixture(); const session = { user: { id: ctx.actor.userId } };
  const request = (context = ctx.snapshot, extra = {}) => new Request("http://localhost/api/agent", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ message: "preview abc_12_6_6", context, ...extra }) });
  const deps = { ...agentApiDependencies, config: () => ({ enabled: true, fakeAllowed: true }), session: async () => session, services: () => ctx };
  const result = await (await handleAgentRequest(request(), deps)).json();
  assert.equal(result.data.status, "ok", JSON.stringify(result)); assert.equal(result.data.preview.saved, "NOT_SAVED");
  assert.equal((await handleAgentRequest(request({ ...ctx.snapshot, currentPlan: syntheticExecution().snapshot.currentPlan }), deps)).status, 400);
  assert.equal((await handleAgentRequest(request(ctx.snapshot, { userId: "foreign" }), deps)).status, 400);
  assert.equal(syntheticPreviewAccess({ actor: ctx.actor, session, snapshot: ctx.snapshot, message: "summary", ip: "test" }), undefined);
});

test("preview permit cannot authorize a non-preview message or an external model", async () => {
  for (const kind of ["fake", "external"] as const) {
    let advertised = false;
    const result = await runReadOnlyAgent({ context: fixture(), message: kind === "fake" ? "summary" : "preview abc_12_6_6", egress: syntheticEgress,
      provider: { kind, next: async request => { advertised ||= request.tools.some(tool => tool.name === "plan.preview"); return { decision: final }; } } });
    assert.equal(advertised, false); assert.equal(result.preview, undefined);
  }
});
test("preview wire parser rejects forged sources, private additions, applied state and invented differences", async () => {
  const { parsePreviewResult } = await import("./preview-contract.ts");
  const value = await executeRegisteredTool("plan.preview", args, fixture());
  assert.ok("differences" in value);
  for (const poisoned of [{ ...value, source: { ...value.source, engine: "real_solver" } }, { ...value, private: "secret" },
    { ...value, applied: "APPLIED" }, { ...value, differences: { ...value.differences, lmd: { current: 100, preview: 120, delta: 999 } } }]) {
    assert.throws(() => parsePreviewResult(poisoned));
  }
});
