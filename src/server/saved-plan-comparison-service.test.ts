import assert from "node:assert/strict";
import test from "node:test";
import { createSavedPlanComparisonReadService } from "./saved-plan-comparison-service.ts";
import { createSavedPlanReadService } from "./saved-plan-read-service.ts";
import { parseSavedPlanComparisonProjection, projectSavedPlanComparison } from "./saved-plan-comparison-projection.ts";
import { syntheticSavedPlan, savedPlanComparisonTestContext, savedPlanTestActor, savedPlanTestNow } from "./agent/saved-plan-test-fixtures.ts";

test("pair read authorizes both IDs before loading payloads and never loads for missing/foreign IDs", async () => {
  const rows = [syntheticSavedPlan("left"), syntheticSavedPlan("right"), syntheticSavedPlan("foreign", "synthetic-other")];
  let reads = 0;
  const metadata = createSavedPlanReadService({ requireConsent: async () => {}, now: () => savedPlanTestNow, loadMetadata: async () => rows });
  const service = createSavedPlanComparisonReadService({ metadata, now: () => savedPlanTestNow, loadDetails: async (userId, ids) => {
    reads++; assert.equal(userId, savedPlanTestActor.userId); assert.deepEqual(ids, ["left", "right"]); return rows;
  } });
  for (const id of ["foreign", "absent"]) assert.deepEqual(await service.readPair(savedPlanTestActor, "left", id), { status: "missing" });
  assert.equal(reads, 0);
  const pair = await service.readPair(savedPlanTestActor, "left", "right"); assert.equal(pair.status, "available");
  assert.equal(reads, 1);
  const json = JSON.stringify(pair);
  for (const key of ["userId", "calculationContext", "publicResult", "operboxContentHmac", "durationMs", "active_teams", "resting_team"]) assert.equal(json.includes(`"${key}"`), false);
});

test("detail owner check survives a faulty repository, and consent failure prevents any read", async () => {
  const rows = [syntheticSavedPlan("left"), syntheticSavedPlan("right")];
  let read = false;
  const metadata = createSavedPlanReadService({ requireConsent: async () => {}, now: () => savedPlanTestNow, loadMetadata: async () => rows });
  const service = createSavedPlanComparisonReadService({ metadata, now: () => savedPlanTestNow,
    loadDetails: async () => rows.map((row) => ({ ...row, userId: "synthetic-other" })) });
  assert.deepEqual(await service.readPair(savedPlanTestActor, "left", "right"), { status: "missing" });
  const denied = createSavedPlanComparisonReadService({
    metadata: createSavedPlanReadService({ requireConsent: async () => { throw new Error("synthetic-private"); },
      now: () => savedPlanTestNow, loadMetadata: async () => { read = true; return rows; } }),
    now: () => savedPlanTestNow, loadDetails: async () => { read = true; return rows; },
  });
  await assert.rejects(denied.readPair(savedPlanTestActor, "left", "right"), { code: "SAVED_PLAN_ACCESS_UNAVAILABLE" });
  await assert.rejects(denied.readPair(null, "left", "right"), { code: "SAVED_PLAN_ACTOR_REQUIRED" });
  assert.equal(read, false);
});

test("expired/retention-excluded IDs are not readable and stale metadata cannot mix revisions", async () => {
  const rows = [syntheticSavedPlan("left"), syntheticSavedPlan("right")];
  rows[1].expiresAt = new Date(savedPlanTestNow.getTime() - 1);
  const ctx = savedPlanComparisonTestContext(rows);
  assert.deepEqual(await ctx.service.readPair(ctx.actor, "left", "right"), { status: "missing" });
  rows[1].expiresAt = null;
  const metadata = createSavedPlanReadService({ requireConsent: async () => {}, now: () => savedPlanTestNow, loadMetadata: async () => rows });
  const changed = createSavedPlanComparisonReadService({ metadata, now: () => savedPlanTestNow,
    loadDetails: async () => rows.map((row) => ({ ...row, updatedAt: new Date(savedPlanTestNow.getTime() + 1) })) });
  await assert.rejects(changed.readPair(ctx.actor, "left", "right"), { code: "SAVED_PLAN_DATA_UNAVAILABLE" });
});

test("unknown/malformed stored data is unavailable, not default-filled", () => {
  const row = syntheticSavedPlan("left");
  for (const result of [null, [], "{}", {}, { ...row.publicResult, maa: { plans: [] } },
    { ...row.publicResult, rotation: { ...row.publicResult.rotation, shifts: Array(13).fill({}) } }]) {
    assert.throws(() => projectSavedPlanComparison(result, row.calculationContext));
  }
  assert.throws(() => projectSavedPlanComparison(row.publicResult, null));
  const projection = projectSavedPlanComparison(row.publicResult, row.calculationContext);
  for (const malformed of [null, [], {}, { ...projection, shifts: Array(13).fill(projection.shifts[0]) },
    { ...projection, rooms: Array(65).fill(projection.rooms[0]) }, { ...projection, daily: { ...projection.daily, lmd: Infinity } }]) {
    assert.throws(() => parseSavedPlanComparisonProjection(malformed));
  }
});

test("projection preserves M2.2 rooms, reads partial metrics, and does not synthesize missing efficiency", () => {
  const row = syntheticSavedPlan("left");
  row.publicResult.rotation.shifts[0].scores.room_lines[0] = { room_id: "trade_1", trade_pct: 20 };
  Object.assign(row.publicResult.rotation.daily.production ?? {}, { battle_records: undefined });
  const projection = projectSavedPlanComparison(row.publicResult, row.calculationContext);
  assert.deepEqual(projection.rooms.find((room) => room.roomId === "trade_1")?.shifts[0].efficiency, { trade_pct: 20 });
  assert.equal(projection.daily.experience, null); assert.equal(projection.daily.lmd, 100);
  assert.equal(projection.daily.pureGold, 2);
  const again = parseSavedPlanComparisonProjection({ ...projection, debug: "synthetic-private", fallbackUsed: true });
  assert.deepEqual(again, projection);
});
