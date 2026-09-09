import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress, call } from "./m3-test-support.ts";
import { AGENT_GOLDEN_SET } from "./golden-cases.ts";
import { LocalDemoProvider, ScriptedLoopProvider } from "./fake-loop-provider.ts";
import { parseLoopDecision, type LoopCall, type LoopProvider } from "./loop-provider.ts";
import { isAgentResultCurrent } from "./run-contract.ts";
const { runReadOnlyAgent } = await import("./orchestrator.ts");
const { visibleTools } = await import("./tool-registry.ts");
for (const item of AGENT_GOLDEN_SET) test(`golden: ${item.id}`, async () => {
  const context = syntheticExecution();
  if (item.mode === "ambiguous") {
    const plan = context.snapshot.currentPlan; const room = plan.rooms!.find((r) => r.roomId === "trade_1")!;
    plan.rooms!.push({ ...structuredClone(room), roomId: "trade_2", label: "贸易站 2", index: 1, layoutOrder: 30 });
    plan.roomCounts.find((r) => r.kind === "trade_post")!.count++;
  }
  if (item.mode === "error") context.savedPlans = { list: async () => { throw new Error("synthetic error"); } };
  const delegate = item.mode === "repeat" ? new ScriptedLoopProvider([call(), call()]) : new LocalDemoProvider();
  const calls: LoopCall[] = [];
  const provider: LoopProvider = { kind: "fake", next: async (request) => {
    const response = await delegate.next(request); const decision = parseLoopDecision(response.decision);
    if (decision.type === "calls") calls.push(...decision.calls); return response;
  } };
  assert.deepEqual(visibleTools(context).map((t) => t.name), item.allowedTools);
  const result = await runReadOnlyAgent({ message: item.message, context, provider, egress: syntheticEgress });
  if (item.tool) { assert.equal(calls[0]?.name, item.tool); assert.deepEqual(calls[0]?.arguments, item.args); }
  else assert.equal(calls.length, 0);
  assert.ok(calls.every((c) => !item.forbiddenTools.includes(c.name)));
  for (const fact of item.facts) assert.ok(result.answer.includes(fact), `${item.id}: missing ${fact}`);
  if (item.code) { assert.equal(result.status, "failed"); assert.ok(result.error === item.code || result.tools.some((t) => t.code === item.code)); }
  else assert.equal(result.status, "ok");
  if (item.mode === "stale") { assert.equal(isAgentResultCurrent(result, "new-revision"), false); assert.equal(isAgentResultCurrent(result, context.snapshot.contextRevision), true); }
  assert.equal(result.sources.some((s) => s.planId === "foreign"), false);
});

for (const message of ["preview abc_12_6_6", "如果把轮换改成 abc_12_6_6，试算一下。", "preview abc_12_12_12"]) test(`golden M4: ${message}`, async () => {
  const { previewExampleSnapshot } = await import("./preview-example.ts");
  const { syntheticPreviewAccess } = await import("./synthetic-planning-preview.ts");
  const { __resetRequestGuardsForTests } = await import("../api-contract.ts");
  __resetRequestGuardsForTests();
  const context = syntheticExecution(); context.snapshot.currentPlan = previewExampleSnapshot();
  const preview = syntheticPreviewAccess({ actor: context.actor, session: { user: { id: context.actor.userId } }, snapshot: context.snapshot, message, ip: "golden-m4" });
  const result = await runReadOnlyAgent({ context: { ...context, preview }, message, provider: new LocalDemoProvider(), egress: syntheticEgress });
  assert.equal(result.status, "ok"); assert.deepEqual(result.tools.map(tool => tool.name), ["plan.preview"]);
  assert.equal(result.preview?.differences?.lmd.delta, 20); assert.equal(result.preview?.saved, "NOT_SAVED");
  assert.equal(result.preview?.applied, "NOT_APPLIED"); assert.match(result.answer, /未保存、未应用/);
});
for (const message of ["保存并应用试算", "枚举全部轮换", "preview arbitrary --shell"]) test(`golden M4 rejected: ${message}`, async () => {
  const context = syntheticExecution();
  const result = await runReadOnlyAgent({ context, message, provider: new LocalDemoProvider(), egress: syntheticEgress });
  assert.equal(result.preview, undefined); assert.equal(result.tools.length, 0);
});

for (const scenario of ["ordinary explanation", "solver failure", "second attempt"] as const) test(`golden M4: ${scenario}`, async () => {
  const { previewExample, previewExampleSnapshot } = await import("./preview-example.ts");
  const { syntheticPlanningDependencies } = await import("./synthetic-planning-preview.ts");
  const { createPlanningService } = await import("../planning-service.ts");
  const { planningActorFromSession } = await import("../planning-actor.ts");
  const { issuePreviewAccess } = await import("./planning-preview-access.ts");
  const { __resetRequestGuardsForTests } = await import("../api-contract.ts");
  __resetRequestGuardsForTests();
  const context = syntheticExecution(); context.snapshot.currentPlan = previewExampleSnapshot();
  let computations = 0;
  const execute = createPlanningService({ ...syntheticPlanningDependencies, runPlan: async (...args) => {
    computations++; return scenario === "solver failure" ? { success: false } : syntheticPlanningDependencies.runPlan(...args);
  } });
  const preview = issuePreviewAccess({ actor: context.actor, snapshot: context.snapshot, execute,
    planningActor: planningActorFromSession({ user: { id: context.actor.userId } }), ip: "golden-preview-boundary",
    baseRevision: "golden-base", rotationProfile: "abc_12_6_6", body: { boxSource: "sample", layout: previewExample().calculationContext.layout } });
  const attempt = call("plan.preview", { baseRevision: "golden-base", rotationProfile: "abc_12_6_6" });
  const provider = scenario === "ordinary explanation" ? new LocalDemoProvider() : new ScriptedLoopProvider([
    attempt, ...(scenario === "second attempt" ? [call("plan.preview", attempt.calls[0].arguments, "second")] : []),
    { type: "final", answer: "试算完成" },
  ]);
  const result = await runReadOnlyAgent({ context: { ...context, preview }, message: scenario === "ordinary explanation" ? "summary" : "preview abc_12_6_6", provider, egress: syntheticEgress });
  assert.equal(computations, scenario === "ordinary explanation" ? 0 : 1);
  if (scenario === "ordinary explanation") {
    assert.equal(result.status, "ok"); assert.equal(result.preview, undefined);
    assert.deepEqual(result.tools.map(tool => tool.name), ["current_plan.get_summary"]);
  } else {
    assert.equal(result.status, "failed"); assert.ok(!result.answer.includes("试算完成"));
    if (scenario === "second attempt") assert.equal(result.error, "AGENT_REPEATED_TOOL_CALL");
  }
});
