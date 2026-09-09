import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress, call, final } from "./m3-test-support.ts";
const { visibleTools, executeRegisteredTool } = await import("./tool-registry.ts");
const { runReadOnlyAgent } = await import("./orchestrator.ts");
const { ScriptedLoopProvider } = await import("./fake-loop-provider.ts");
const { assertModelEgress } = await import("./egress-policy.ts");
const { agentFeatureConfig } = await import("./feature-config.ts");
const { parseAgentFinalResult } = await import("./run-contract.ts");
const run = (script: ConstructorParameters<typeof ScriptedLoopProvider>[0], extra: Partial<Parameters<typeof runReadOnlyAgent>[0]> = {}) => runReadOnlyAgent({ message: "synthetic question", context: syntheticExecution(), egress: syntheticEgress, provider: new ScriptedLoopProvider(script), ...extra });

test("registry contains exactly four read-only tools, strict arguments and identical execution policy", async () => {
  const ctx = syntheticExecution();
  assert.deepEqual(visibleTools(ctx).map((t) => t.name), ["current_plan.get_summary", "current_plan.get_room_detail", "saved_plan.list", "saved_plan.compare"]);
  for (const tool of visibleTools(ctx)) { assert.equal(tool.effect, "read"); assert.equal(tool.inputSchema.additionalProperties, false); }
  assert.deepEqual(visibleTools({ ...ctx, actor: null }), []);
  assert.equal(visibleTools({ ...ctx, snapshot: null }).length, 2);
  for (const name of ["current_plan.*", "CURRENT_PLAN.get_summary", "write", "shell"]) await assert.rejects(executeRegisteredTool(name, {}, ctx), { code: "AGENT_UNKNOWN_TOOL" });
  await assert.rejects(executeRegisteredTool("current_plan.get_summary", {}, { ...ctx, snapshot: null }), { code: "AGENT_TOOL_FORBIDDEN" });
  for (const tool of visibleTools(ctx)) await assert.rejects(executeRegisteredTool(tool.name, { userId: "foreign" }, ctx), { code: "AGENT_TOOL_INVALID_INPUT" });
  assert.deepEqual(visibleTools({ ...ctx, actor: { ...ctx.actor } }), []);
});
test("egress is checked before every provider invocation, independent of API key or env override", async () => {
  assert.doesNotThrow(() => assertModelEgress("external", syntheticEgress));
  assert.doesNotThrow(() => assertModelEgress("fake", syntheticEgress));
  const business = { classification: "user_business_context" as const, localTestApproved: true };
  assert.throws(() => assertModelEgress("external", business), { code: "AGENT_MODEL_EGRESS_BLOCKED" });
  assert.throws(() => assertModelEgress("fake", { ...business, localTestApproved: false }), { code: "AGENT_MODEL_EGRESS_BLOCKED" });
  assert.doesNotThrow(() => assertModelEgress("fake", business));
  let invoked = false;
  const result = await run([], { egress: business, provider: { kind: "external", next: async () => { invoked = true; return { decision: final }; } } });
  assert.equal(result.error, "AGENT_MODEL_EGRESS_BLOCKED"); assert.equal(invoked, false);
  assert.equal(agentFeatureConfig({ AGENT_FEATURE_ENABLED: "1", AGENT_MODEL_MODE: "fake", APP_DEPLOYMENT_ENV: "production", NODE_ENV: "test" }).fakeAllowed, false);
  assert.equal(agentFeatureConfig({}).enabled, false);
});
test("one/two/multiple tool calls use real M2 outputs and only code-derived sources", async () => {
  for (const script of [[call(), final], [call(), call("saved_plan.list", { query: null }, "call-2"), final],
    [{ type: "calls" as const, calls: [...call().calls, ...call("saved_plan.list", { query: null }, "call-2").calls] }, final]]) {
    const result = await run(script); assert.equal(result.status, "ok"); assert.ok(result.sources.length); assert.deepEqual(parseAgentFinalResult(result), result);
    assert.equal(result.sources[0].contextRevision, "synthetic-rev-1");
    assert.equal(result.sources[0].planDiagnosticId, "synthetic-left");
    assert.equal(JSON.stringify(result).includes('"userId"'), false);
  }
  const noTools = await run([final]); assert.deepEqual(noTools.sources, []);
  const bad = await run([call("saved_plan.compare", { leftPlanId: "left", rightPlanId: "foreign" }), { type: "final", answer: "Success!" }]);
  assert.equal(bad.status, "failed"); assert.equal(bad.tools[0].code, "PLAN_NOT_FOUND_OR_FORBIDDEN"); assert.deepEqual(bad.sources, []); assert.doesNotMatch(bad.answer, /Success/);
});
for (const [title, name, args, code] of [
  ["invalid arguments", "current_plan.get_summary", { userId: "foreign" }, "AGENT_TOOL_INVALID_INPUT"],
  ["unknown tool", "shell", {}, "AGENT_UNKNOWN_TOOL"],
  ["missing room", "current_plan.get_room_detail", { roomRef: "none", shiftIndex: null }, "ROOM_NOT_FOUND"],
] as const) test(title, async () => {
  const result = await run([call(name, args), final]); assert.equal(result.error, "AGENT_TOOL_FAILURE"); assert.equal(result.tools[0].code, code);
});
test("repeated calls ignore object key order, and tool count and step count are hard bounds", async () => {
  assert.equal((await run([call("saved_plan.list", { query: null }), call("saved_plan.list", { query: null }, "call-2")])).error, "AGENT_REPEATED_TOOL_CALL");
  const many = { type: "calls" as const, calls: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: "saved_plan.list", arguments: { query: `q${i}` } })) };
  assert.equal((await run([many])).error, "AGENT_TOOL_CALL_LIMIT");
  assert.equal((await run(Array.from({ length: 5 }, (_, i) => call("saved_plan.list", { query: `q${i}` }, `c${i}`)))).error, "AGENT_STEP_LIMIT");
});
test("timeouts/abort race non-cooperative providers, no late results accepted", async () => {
  const hang = async () => new Promise<never>(() => {});
  assert.equal((await run([hang], { deadlines: { totalMs: 10 } })).error, "AGENT_RUN_TIMEOUT");
  const abort = new AbortController(); const pending = run([hang], { signal: abort.signal }); abort.abort();
  assert.equal((await pending).error, "AGENT_ABORTED");
  const ctx = syntheticExecution(); ctx.savedPlans = { list: hang };
  const timeout = await run([call("saved_plan.list", { query: null }), final], { context: ctx, deadlines: { toolMs: 5 } });
  assert.equal(timeout.tools[0].code, "AGENT_TOOL_TIMEOUT"); assert.equal(timeout.status, "failed");
});
test("provider errors and usage overflow expose only stable codes", async () => {
  const error = await run([new Error("private provider raw response")]); assert.equal(error.error, "AGENT_PROVIDER_ERROR");
  assert.equal(JSON.stringify(error).includes("private"), false);
  assert.equal((await run([], { provider: { kind: "fake", next: async () => ({ decision: final, usage: { totalTokens: 12001 } }) } })).error, "AGENT_USAGE_LIMIT");
});
test("sensitive keys and raw input never enter final DTO; failures cannot claim success", async () => {
  const result = await run([call(), final]);
  const forbidden = new Set(["debug", "userId", "session", "token", "cred", "rawResponse", "prompt", "publicResult", "calculationContext", "operBox", "authorization"]);
  function inspect(value: unknown) { if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false); inspect(child); } }
  inspect(result); assert.ok(JSON.stringify(result).length < 16384);
});
test("provider cannot forge sources, oversized answers, or malformed tool calls", async () => {
  for (const decision of [{ ...final, sources: [{ planId: "foreign" }] }, { type: "final", answer: "x".repeat(3001) },
    { type: "calls", calls: [{ id: "a", name: "current_plan.get_summary", arguments: {}, userId: "foreign" }] }]) {
    const result = await run([], { provider: { kind: "fake", next: async () => ({ decision }) } });
    assert.equal(result.error, "AGENT_MODEL_INVALID_OUTPUT"); assert.deepEqual(result.sources, []);
  }
});

test("synthetic deadlines are bounded, request-local, and cannot raise normal API budgets", async (t) => {
  const timers: number[] = []; const original = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (...args: Parameters<typeof setTimeout>) => { timers.push(Number(args[1])); return original(...args); });
  for (const syntheticAcceptance of [false, true, false]) {
    timers.length = 0;
    const result = await run([call(), final], { syntheticAcceptance, deadlines: { totalMs: 60000, toolMs: 12000 } });
    assert.equal(result.status, "ok");
    const maximum = syntheticAcceptance ? 60000 : 20000;
    assert.ok(timers[0] <= maximum && timers[0] > maximum - 1000);
    assert.ok(timers.includes(syntheticAcceptance ? 12000 : 5000));
  }
  timers.length = 0;
  assert.equal((await run([final])).status, "ok"); assert.ok(timers[0] <= 20000 && timers[0] > 19000);
  for (const deadlines of [{ totalMs: Infinity }, { totalMs: 60001 }, { toolMs: 12001 }, { toolMs: NaN }]) assert.equal((await run([final], { syntheticAcceptance: true, deadlines })).error, "AGENT_MODEL_CONFIG_INVALID");
  assert.equal((await run([final], { syntheticAcceptance: true, egress: { classification: "user_business_context", localTestApproved: true } })).error, "AGENT_MODEL_CONFIG_INVALID");
});

test("synthetic custom total budget bounds tool waiting and preserves caller cancellation", async () => {
  const hang = async () => new Promise<never>(() => {});
  const ctx = syntheticExecution(); ctx.savedPlans = { list: hang };
  const result = await run([call("saved_plan.list", { query: null }), final], { context: ctx, syntheticAcceptance: true, deadlines: { totalMs: 15, toolMs: 12000 } });
  assert.equal(result.status, "failed"); assert.equal(result.tools[0].code, "AGENT_TOOL_TIMEOUT");
  const controller = new AbortController(); let providerAborted = false;
  const pending = run([], { syntheticAcceptance: true, deadlines: { totalMs: 60000 }, signal: controller.signal, provider: { kind: "fake", async next(request) {
    request.signal.addEventListener("abort", () => { providerAborted = true; }, { once: true });
    controller.abort(); return hang();
  } } });
  assert.equal((await pending).error, "AGENT_ABORTED"); assert.equal(providerAborted, true);
});
