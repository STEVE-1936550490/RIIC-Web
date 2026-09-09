import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution } from "./m3-test-support.ts";
import { previewExample } from "./preview-example.ts";
import { assertOperbox } from "../../operbox.ts";
const { createPlanningService } = await import("../planning-service.ts");
const { planningActorFromSession } = await import("../planning-actor.ts");
const { syntheticPlanningDependencies } = await import("./synthetic-planning-preview.ts");
const { handlePlanningRequest, planningApiDependencies } = await import("../planning-api.ts");
const { __resetRequestGuardsForTests, acquirePlanSlot } = await import("../api-contract.ts");
function setup(overrides: Partial<typeof syntheticPlanningDependencies> = {}) {
  __resetRequestGuardsForTests();
  const session = { user: { id: "service-test", createdAt: new Date(0), emailVerified: true } };
  const actor = planningActorFromSession(session);
  const input = { actor, ip: "service-ip", requestId: "synthetic-service", body: { boxSource: "sample", rotation: "abc_12_6_6", layout: previewExample().calculationContext.layout } };
  return { session, actor, input, execute: createPlanningService({ ...syntheticPlanningDependencies, ...overrides }) };
}
test("HTTP handler invokes shared validated core and preserves public DTO / origin / session envelope", async () => {
  let calls = 0;
  const fx = setup({ runPlan: async (...args) => { calls++; return syntheticPlanningDependencies.runPlan(...args); } });
  const deps = { ...planningApiDependencies, websiteSession: async () => fx.session as Awaited<ReturnType<typeof planningApiDependencies.websiteSession>>, executePlanning: fx.execute };
  const request = (origin = "http://localhost", body = fx.input.body) => new Request("http://localhost/api/plan", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await handlePlanningRequest(request(), deps); const wire = await response.json();
  assert.equal(response.status, 200, JSON.stringify(wire)); assert.equal(calls, 1); assert.equal(wire.data.rotation.profile, "abc_12_6_6");
  assert.equal(Object.hasOwn(wire.data, "cacheHit"), false); assert.equal(Object.hasOwn(wire.data, "stdout"), false);
  assert.equal((await handlePlanningRequest(request("http://foreign.invalid"), deps)).status, 403); assert.equal(calls, 1);
  await assert.rejects(fx.execute({ ...fx.input, body: { ...fx.input.body, layout: undefined } }), { code: "AIC-LAYOUT-1201" });
  await assert.rejects(fx.execute({ ...fx.input, actor: { ...fx.actor } }), { code: "AIC-AUTH-2008" });
});
test("shared cache hit bypasses solver capacity, records reference, and keeps anonymous sample owner null", async () => {
  const records: unknown[] = []; const references: { userId: string | null }[] = []; let calls = 0;
  const fx = setup({ getPlanCacheSolverIdentity: async () => ({}) as NonNullable<Awaited<ReturnType<typeof syntheticPlanningDependencies.getPlanCacheSolverIdentity>>>,
    resolvePlanCache: async () => ({ kind: "hit", keyHmac: "synthetic-key", result: previewExample().publicResult, lookupDurationMs: 0 }),
    recordPlanRunBestEffort: async (record) => { records.push(record); return true; },
    recordPlanCacheReferenceBestEffort: async (reference) => { references.push({ userId: reference.userId ?? null }); return true; },
    runPlan: async () => { calls++; throw new Error("no solver"); } });
  const release = acquirePlanSlot({ ip: fx.input.ip, accountId: fx.actor.userId!, accountClass: "established" });
  try { assert.equal((await fx.execute(fx.input)).cacheHit, true); } finally { release(); }
  assert.equal(calls, 0); assert.equal(records.length, 1); assert.equal(references[0].userId, null);
});
test("shared cache publishes only after run and ownership reference are durable", async () => {
  const events: string[] = [];
  const fx = setup({ getPlanCacheSolverIdentity: async () => ({}) as NonNullable<Awaited<ReturnType<typeof syntheticPlanningDependencies.getPlanCacheSolverIdentity>>>,
    resolvePlanCache: async () => ({ kind: "lease", keyHmac: "synthetic-key", leaseOwner: "test" }),
    recordPlanRunBestEffort: async () => { events.push("record"); return true; },
    recordPlanCacheReferenceBestEffort: async () => { events.push("reference"); return true; },
    completePlanCache: async () => { events.push("publish"); }, releasePlanCacheLease: async () => { events.push("release"); } });
  await fx.execute(fx.input); assert.deepEqual(events, ["record", "reference", "publish"]);
});
test("shared service holds admission until non-cooperative solver settles after cancellation", async () => {
  let finish: (() => void) | undefined; let calls = 0;
  const fx = setup({ runPlan: async (...args) => { calls++; await new Promise<void>(resolve => { finish = resolve; }); return syntheticPlanningDependencies.runPlan(...args); } });
  const controller = new AbortController(); const pending = fx.execute({ ...fx.input, signal: controller.signal });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort();
  await assert.rejects(fx.execute(fx.input), { code: "AIC-PLAN-3005" });
  finish(); await assert.rejects(pending); assert.equal(calls, 1);
  acquirePlanSlot({ ip: fx.input.ip, accountId: fx.actor.userId!, accountClass: "established" })();
});
test("cancel while cache is pending never starts solver and releases acquired lease", async () => {
  let finish: (() => void) | undefined; let calls = 0; let released = 0;
  const fx = setup({ getPlanCacheSolverIdentity: async () => ({}) as NonNullable<Awaited<ReturnType<typeof syntheticPlanningDependencies.getPlanCacheSolverIdentity>>>,
    resolvePlanCache: async () => { await new Promise<void>(resolve => { finish = resolve; }); return { kind: "lease", keyHmac: "synthetic-key", leaseOwner: "test" }; },
    releasePlanCacheLease: async () => { released++; }, runPlan: async () => { calls++; throw new Error(); } });
  const controller = new AbortController(); const pending = fx.execute({ ...fx.input, signal: controller.signal });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort(); finish(); await assert.rejects(pending); assert.equal(calls, 0); assert.equal(released, 1);
});
test("queued deployment still forbids personal synchronous input; M0 services remain unchanged", async () => {
  const fx = setup({ isPlanTaskQueueEnabled: () => true });
  await assert.rejects(fx.execute({ ...fx.input, body: { ...fx.input.body, boxSource: "maa" } }), { code: "AIC-PLAN-3001" });
  assert.equal(syntheticExecution().snapshot.currentPlan.shifts.length, 2);
});

test("personal HTTP planning uses the session identity and refuses unauthenticated execution", async () => {
  const { PublicApiError } = await import("../api-contract.ts");
  let owner: string | null | undefined; let calls = 0;
  const fx = setup({ isPlanTaskQueueEnabled: () => false,
    recordPlanRunBestEffort: async record => { owner = record.userId; return true; },
    runPlan: async (...args) => { calls++; return syntheticPlanningDependencies.runPlan(...args); } });
  const sample = await syntheticPlanningDependencies.getSampleOperbox();
  const body = { ...fx.input.body, boxSource: "maa", operbox: sample.operbox, userId: "forged-user" };
  const request = () => new Request("http://localhost/api/plan", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
  const deps = { ...planningApiDependencies, executePlanning: fx.execute,
    requireWebsiteSession: async () => fx.session as Awaited<ReturnType<typeof planningApiDependencies.requireWebsiteSession>> };
  assert.equal((await handlePlanningRequest(request(), deps)).status, 200);
  assert.equal(owner, fx.session.user.id); assert.equal(calls, 1);
  assert.equal((await handlePlanningRequest(request(), { ...deps, requireWebsiteSession: async () => { throw new PublicApiError("AIC-AUTH-2008"); } })).status, 401);
  assert.equal(calls, 1);
});

test("normal planning HTTP rejects invalid input before solver and preserves a safe solver failure envelope", async () => {
  let calls = 0;
  const fx = setup({ runPlan: async () => { calls++; return { success: false, stderr: "PRIVATE_SOLVER_TEXT" }; } });
  const deps = { ...planningApiDependencies, websiteSession: async () => null, executePlanning: fx.execute };
  const request = (body: unknown) => new Request("http://localhost/api/plan", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
  for (const body of [{ ...fx.input.body, layout: {} }, { ...fx.input.body, rotation: "--arbitrary-flag" }, { ...fx.input.body, sourceName: "x".repeat(3 * 1024 * 1024) }]) {
    const response = await handlePlanningRequest(request(body), deps);
    assert.ok(response.status >= 400); assert.equal(calls, 0);
  }
  const failed = await handlePlanningRequest(request(fx.input.body), deps);
  const wire = await failed.json(); assert.equal(wire.success, false); assert.ok(failed.status >= 400);
  assert.equal(calls, 1); assert.ok(!JSON.stringify(wire).includes("PRIVATE_SOLVER_TEXT"));
});

test("normal page shared core forwards all solver-affecting cache input dimensions without mutating the request", async () => {
  const inputs: Parameters<typeof syntheticPlanningDependencies.resolvePlanCache>[0][] = [];
  const fx = setup({ getPlanCacheSolverIdentity: async () => ({}) as NonNullable<Awaited<ReturnType<typeof syntheticPlanningDependencies.getPlanCacheSolverIdentity>>>,
    resolvePlanCache: async input => { inputs.push(structuredClone(input)); return { kind: "bypass" }; } });
  const sample = await syntheticPlanningDependencies.getSampleOperbox();
  const body = { ...fx.input.body, boxSource: "maa", operbox: assertOperbox(sample.operbox), sourceName: "synthetic personal box", fiammetta_enable: false };
  const before = structuredClone(body);
  await fx.execute({ ...fx.input, body });
  assert.deepEqual(body, before);
  assert.deepEqual(inputs[0].layout, body.layout); assert.deepEqual(inputs[0].operbox, body.operbox);
  assert.equal(inputs[0].rotation, body.rotation); assert.equal(inputs[0].fiammettaEnable, false);
  assert.equal(inputs[0].sourceType, "maa"); assert.equal(inputs[0].sourceName, body.sourceName);
  assert.ok(inputs[0].solver); assert.equal(Object.hasOwn(inputs[0], "userId"), false);
});
