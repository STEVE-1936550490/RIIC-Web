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
