import assert from "node:assert/strict";
import test from "node:test";
import { syntheticSavedPlan, savedPlanComparisonTestContext } from "../saved-plan-test-fixtures.ts";
import { executeSavedPlanCompare, parseSavedPlanCompareInput, SAVED_PLAN_COMPARE_TOOL, type SavedPlanCompareResult } from "./saved-plan-compare.ts";
import { SavedPlanToolInputError } from "./saved-plan-list.ts";

function data(result: SavedPlanCompareResult) { assert.equal(result.status, "ok"); assert.ok("data" in result); return result.data; }
async function compare(left = syntheticSavedPlan("left"), right = syntheticSavedPlan("right")) {
  return executeSavedPlanCompare({ leftPlanId: left.id, rightPlanId: right.id }, savedPlanComparisonTestContext([left, right]));
}

test("strict compare contract is read-only with two explicit IDs", () => {
  assert.equal(SAVED_PLAN_COMPARE_TOOL.name, "saved_plan.compare"); assert.equal(SAVED_PLAN_COMPARE_TOOL.effect, "read");
  assert.equal(SAVED_PLAN_COMPARE_TOOL.inputSchema.additionalProperties, false);
  assert.deepEqual(parseSavedPlanCompareInput({ leftPlanId: "left", rightPlanId: "right" }), { leftPlanId: "left", rightPlanId: "right" });
});
for (const [name, input] of [
  ["null", null], ["array", []], ["string", "{}"], ["missing left", { rightPlanId: "a" }], ["missing right", { leftPlanId: "a" }],
  ["blank", { leftPlanId: " ", rightPlanId: "b" }], ["number", { leftPlanId: 1, rightPlanId: "b" }],
  ["long", { leftPlanId: "a".repeat(129), rightPlanId: "b" }], ["path", { leftPlanId: "../a", rightPlanId: "b" }],
  ...["userId", "currentPlan", "result", "database", "permissions"].map((key) => [key, { leftPlanId: "a", rightPlanId: "b", [key]: "synthetic" }]),
] as const) test(`compare rejects ${name}`, async () => {
  await assert.rejects(executeSavedPlanCompare(input, savedPlanComparisonTestContext()), SavedPlanToolInputError);
});

test("compares two owned plans and one plan with itself without inventing changes", async () => {
  const result = data(await compare());
  assert.equal(result.hasKnownDifferences, false);
  assert.deepEqual(result.rooms, []); assert.deepEqual(result.shifts.changes, []);
  assert.ok(result.production.metrics.every((item) => item.comparison.status === "comparable" && item.comparison.delta === 0));
  const row = syntheticSavedPlan("left");
  const self = data(await executeSavedPlanCompare({ leftPlanId: "left", rightPlanId: "left" }, savedPlanComparisonTestContext([row])));
  assert.equal(self.samePlan, true); assert.equal(self.hasKnownDifferences, false);
});

test("left/right missing and another actor's ID give the identical non-enumerating result", async () => {
  const ctx = savedPlanComparisonTestContext([syntheticSavedPlan("left"), syntheticSavedPlan("right"), syntheticSavedPlan("foreign", "synthetic-other")]);
  const responses = await Promise.all([
    { leftPlanId: "absent", rightPlanId: "right" }, { leftPlanId: "left", rightPlanId: "absent" },
    { leftPlanId: "foreign", rightPlanId: "right" }, { leftPlanId: "left", rightPlanId: "foreign" },
  ].map((input) => executeSavedPlanCompare(input, ctx)));
  assert.deepEqual(responses[0], { status: "missing", source: { type: "saved_plans" }, issue: { code: "PLAN_NOT_FOUND_OR_FORBIDDEN" }, truncation: { applied: false, omittedCount: 0 } });
  for (const result of responses) assert.deepEqual(result, responses[0]);
});

test("detects added/removed rooms, room levels, configured and per-shift products", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  right.calculationContext.layout.rooms.push({ id: "trade_2", kind: "trade_post", level: 3, product: { trade: { order: "gold" } } });
  for (const plan of right.publicResult.maa.plans) plan.rooms.trading?.push({ operators: ["新增甲"], product: "LMD" });
  right.calculationContext.layout.rooms[1].level = 2;
  right.calculationContext.layout.rooms[2].product = { factory: { recipe: "battle_record" } };
  for (const plan of right.publicResult.maa.plans) { assert.ok(plan.rooms.manufacture); plan.rooms.manufacture[0].product = "Battle Record"; }
  const result = data(await compare(left, right));
  assert.equal(result.rooms.find((room) => room.roomId === "trade_2")?.status, "added");
  assert.deepEqual(result.rooms.find((room) => room.roomId === "trade_1")?.level, { left: 3, right: 2 });
  const factory = result.rooms.find((room) => room.roomId === "manu_1"); assert.ok(factory);
  assert.deepEqual(factory.configuredProduct, { left: "factory:gold", right: "factory:battle_record" });
  assert.deepEqual(factory.shifts[0].product, { left: "贵金属", right: "作战记录" });
  assert.equal(data(await compare(right, left)).rooms.find((room) => room.roomId === "trade_2")?.status, "removed");
});

test("shift additions/removals, duration and period/team structure changes use array positions", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  right.publicResult.maa.plans.push(structuredClone(right.publicResult.maa.plans[0]));
  right.publicResult.rotation.shifts.push(structuredClone(right.publicResult.rotation.shifts[0]));
  right.publicResult.trainingRoom?.shifts.push({ trainee: null, trainer: null });
  right.publicResult.rotation.shifts[0].duration_hours = 6;
  right.publicResult.rotation.shifts[1].active_teams = ["synthetic-new-team"];
  right.publicResult.maa.plans[1].period = [["00:00", "06:00"]];
  const result = data(await compare(left, right));
  assert.deepEqual(result.shifts.count, { status: "comparable", left: 2, right: 3, delta: 1 });
  assert.deepEqual(result.shifts.changes[0].durationHours, { status: "comparable", left: 12, right: 6, delta: -6 });
  assert.equal(result.shifts.changes[1].periodsChanged, true); assert.equal(result.shifts.changes[1].structureChanged, true);
  assert.equal(result.shifts.changes[2].status, "added");
  assert.equal(data(await compare(right, left)).shifts.changes[2].status, "removed");
});

test("personnel are sets: order/duplicates/skill suffix do not create false personnel changes", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  assert.ok(left.publicResult.maa.plans[0].rooms.trading); assert.ok(right.publicResult.maa.plans[0].rooms.trading);
  left.publicResult.maa.plans[0].rooms.trading[0].operators = ["甲", "乙", "甲"];
  right.publicResult.maa.plans[0].rooms.trading[0].operators = [{ name: "乙", skill: 2 }, "甲"];
  assert.equal(data(await compare(left, right)).hasKnownDifferences, false);
  right.publicResult.maa.plans[0].rooms.trading[0].operators = ["乙", "丙"];
  const room = data(await compare(left, right)).rooms.find((room) => room.roomId === "trade_1"); assert.ok(room);
  assert.deepEqual(room.shifts[0].operators, { status: "comparable", added: ["丙"], removed: ["甲"] });
});

test("training is role-specific, including swaps invisible to a set comparison", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  assert.ok(left.publicResult.trainingRoom); assert.ok(right.publicResult.trainingRoom);
  left.publicResult.trainingRoom.shifts[0] = { trainee: "学员甲", trainer: "教官乙" };
  right.publicResult.trainingRoom.shifts[0] = { trainee: "教官乙", trainer: "学员甲" };
  const training = data(await compare(left, right)).training;
  assert.equal(training.status, "comparable"); assert.ok("changes" in training);
  assert.deepEqual(training.changes.map((change) => change.position), ["trainee", "trainer"]);
  delete right.publicResult.trainingRoom;
  assert.deepEqual(data(await compare(left, right)).training, { status: "not_comparable", reason: "TRAINING_DATA_UNAVAILABLE" });
});

test("public efficiency and daily delta have explicit matching bases and gold units", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  assert.ok(right.publicResult.rotation.daily.production);
  right.publicResult.rotation.daily.production.lmd = 150;
  right.publicResult.rotation.daily.production.pure_gold = 2000;
  right.publicResult.rotation.shifts[0].scores.room_lines[0].final_efficiency = 1.5;
  const result = data(await compare(left, right));
  assert.deepEqual(result.production.metrics[0].comparison, { status: "comparable", left: 100, right: 150, delta: 50 });
  assert.deepEqual(result.production.metrics[1].comparison, { status: "comparable", left: 2, right: 4, delta: 2 });
  const room = result.rooms.find((room) => room.roomId === "trade_1"); assert.ok(room);
  assert.deepEqual(room.shifts[0].efficiency[0].comparison, { status: "comparable", left: 1.2, right: 1.5, delta: 1.5 - 1.2 });
});

test("single-sided metrics, different schema/source basis and context incompatibility are not comparable", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  Object.assign(right.publicResult.rotation.daily.production ?? {}, { lmd: undefined });
  let result = data(await compare(left, right));
  assert.deepEqual(result.production.metrics[0].comparison, { status: "not_comparable", reason: "MISSING_RIGHT_VALUE" });
  assert.equal(result.production.metrics[1].comparison.status, "comparable");
  right.publicResult.profile.schema_version = 5;
  result = data(await compare(left, right));
  assert.deepEqual(result.production.metrics[1].comparison, { status: "not_comparable", reason: "SOURCE_BASIS_MISMATCH" });
  right.calculationContext.fiammettaEnabled = true;
  result = data(await compare(left, right));
  assert.deepEqual(result.production.metrics[1].comparison, { status: "not_comparable", reason: "CONTEXT_INCOMPATIBLE" });
});

test("missing duration/occupancy never becomes a default duration, empty room or zero delta", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  Object.assign(right.publicResult.rotation.shifts[0], { duration_hours: undefined });
  assert.ok(right.publicResult.maa.plans[0].rooms.trading);
  Object.assign(right.publicResult.maa.plans[0].rooms.trading[0], { operators: undefined });
  const result = data(await compare(left, right));
  assert.deepEqual(result.shifts.changes[0].durationHours, { status: "not_comparable", reason: "MISSING_RIGHT_VALUE" });
  const room = result.rooms.find((room) => room.roomId === "trade_1"); assert.ok(room);
  assert.equal(room.status, "not_comparable"); assert.equal(room.shifts[0].operators.status, "not_comparable");
  assert.equal(result.hasKnownDifferences, false);
});

const forbidden = /^(debug|cred|credential|cookie|token|authorization|stdout|stderr|operbox|userId|accountUid|deviceId|inventory|orders|connectionString|rawResponse|publicResult|result|calculationContext|operboxContentHmac|projection|basis|structureKey|contextKey|fallbackUsed|solverAttempts|durationMs)$/i;
function sensitive(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) { assert.equal(forbidden.test(key), false, key); sensitive(item); }
}
test("whitelists DTOs, excludes raw results/debug/context/Box hashes, durationMs and upstream drone fields", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  const before = await compare(left, right);
  const extras = { debug: { stdout: "synthetic-private" }, userId: "synthetic-private", solverAttempts: [], fallbackUsed: true, inventory: ["synthetic-private"] };
  Object.assign(right, extras); right.userId = left.userId;
  Object.assign(right.publicResult, extras); Object.assign(right.publicResult.profile, extras);
  Object.assign(right.publicResult.rotation.shifts[0].scores.room_lines[0], extras);
  right.publicResult.durationMs = 999999;
  right.publicResult.rotation.daily.drone_production = { lmd: 888888, pure_gold: 999999, battle_records: 123456 };
  const after = await compare(left, right);
  assert.deepEqual(after, before); sensitive(after);
  assert.equal(JSON.stringify(after).includes("synthetic-private"), false);
  assert.deepEqual(await compare(left, right), after);
});

test("room and person truncation are structural with exact omitted counts", async () => {
  const ctx = savedPlanComparisonTestContext();
  const pair = await ctx.service.readPair(ctx.actor, "left", "right"); assert.equal(pair.status, "available");
  if (pair.status !== "available") throw new Error();
  const leftRoom = pair.left.projection.rooms[1]; const rightRoom = pair.right.projection.rooms[1];
  pair.left.projection.rooms = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(leftRoom), roomId: `trade_${i}`, index: i, layoutOrder: i }));
  pair.right.projection.rooms = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(rightRoom), roomId: `trade_${i}`, index: i, layoutOrder: i, level: 2 }));
  const context = { actor: ctx.actor, service: { readPair: async () => pair } };
  const first = await executeSavedPlanCompare({ leftPlanId: "left", rightPlanId: "right" }, context);
  assert.equal(data(first).rooms.length, 16); assert.deepEqual(first.truncation, { applied: true, omittedCount: 4 });
  pair.left.projection.rooms = [structuredClone(leftRoom)]; pair.right.projection.rooms = [structuredClone(rightRoom)];
  pair.left.projection.rooms[0].shifts[0].operators = Array.from({ length: 64 }, (_, i) => `左${i}`);
  pair.right.projection.rooms[0].shifts[0].operators = Array.from({ length: 64 }, (_, i) => `右${i}`);
  const second = await executeSavedPlanCompare({ leftPlanId: "left", rightPlanId: "right" }, context);
  assert.deepEqual(second.truncation, { applied: true, omittedCount: 88 });
  assert.deepEqual(await executeSavedPlanCompare({ leftPlanId: "left", rightPlanId: "right" }, context), second);
});

test("UTF-8 result budget, training cap and deterministic nonmutation", async () => {
  const left = syntheticSavedPlan("left"); const right = syntheticSavedPlan("right");
  for (const row of [left, right]) {
    row.publicResult.maa.plans = Array.from({ length: 12 }, () => structuredClone(row.publicResult.maa.plans[0]));
    row.publicResult.rotation.shifts = Array.from({ length: 12 }, () => structuredClone(row.publicResult.rotation.shifts[0]));
    row.publicResult.trainingRoom = { schema_version: 1, shifts: Array.from({ length: 12 }, () => ({ trainee: row.id + "甲", trainer: row.id + "乙" })) };
    for (const plan of row.publicResult.maa.plans) { assert.ok(plan.rooms.trading); plan.rooms.trading[0].operators = Array.from({ length: 8 }, (_, i) => row.id + "😀".repeat(100) + i); }
  }
  const before = structuredClone([left, right]);
  const result = await compare(left, right);
  assert.equal(result.truncation.applied, true);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 16 * 1024);
  const training = data(result).training;
  assert.equal(training.status, "comparable"); assert.ok("changes" in training); assert.ok(training.changes.length <= 12);
  assert.deepEqual([left, right], before);
  assert.deepEqual(await compare(left, right), result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
