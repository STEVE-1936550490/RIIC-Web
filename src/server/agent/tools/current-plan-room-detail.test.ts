import assert from "node:assert/strict";
import test from "node:test";
import type { BaseBlueprint, PublicPlanData, SklandScheduleSnapshot } from "../../../types.ts";
import { planToRows } from "../../../schedule.ts";
import {
  AgentContextContractError, AgentContextShapeError, AGENT_CONTEXT_SCHEMA_VERSION,
  AGENT_ROOM_EFFICIENCY_FIELDS, MAX_AGENT_CONTEXT_BYTES, MAX_AGENT_ROOM_OPERATORS,
  MAX_AGENT_ROOM_TEXT_LENGTH, createSafeCurrentPlanSnapshot, createSafeObservedScheduleSnapshot,
  parseAgentContextSnapshot, validateAgentContextSnapshot,
  type AgentContextSnapshot, type SafeCurrentPlanRoom,
} from "../context-contract.ts";
import {
  CURRENT_PLAN_ROOM_DETAIL_TOOL, CurrentPlanRoomDetailInputError,
  MAX_CURRENT_PLAN_ROOM_REF_LENGTH, MAX_ROOM_DETAIL_CANDIDATES,
  MAX_ROOM_DETAIL_RESULT_BYTES, parseCurrentPlanRoomDetailInput, executeCurrentPlanRoomDetail,
  type CurrentPlanRoomDetailResult,
} from "./current-plan-room-detail.ts";

const layout: BaseBlueprint = {
  template: "synthetic", drone_cap: 200, scenario: {},
  rooms: [
    { id: "trade_2", kind: "trade_post", level: 3 },
    { id: "trade_1", kind: "trade_post", level: 2 },
    { id: "power_1", kind: "power_plant", level: 3 },
    { id: "workshop", kind: "workshop", level: 3 },
    { id: "training_room", kind: "training_room", level: 3 },
  ],
};

function syntheticPlan(): PublicPlanData {
  return {
    profile: {
      schema_version: 4, rotation_profile: "main_backup_12_12", layout_label: "合成布局",
      operbox_label: "合成", baseline_label: "合成", summary: { owned: 6, tier_up_owned: 0, trade_pool_ready: 0 },
      domains: [], rotation: {}, baseline_rotation: {}, actions: [], flags: [], narration_hints: [],
    },
    maa: { title: "合成", plans: [0, 1].map((i) => ({
      name: `合成班次 ${i}`,
      rooms: {
        trading: [
          { operators: i ? ["计划乙"] : ["计划甲", { name: "计划丙", skill: 1 }], product: "LMD" },
          { operators: [], product: "Originium Shard" },
        ],
        power: [{ operators: ["Lancet-2"] }],
        // A missing processing room is not an empty processing room.
      },
    })) },
    rotation: {
      profile: "main_backup_12_12",
      shifts: [0, 1].map((i) => ({
        // Deliberately distinct metadata: selection must use array position.
        index: i + 7, duration_hours: i ? 6 : 12, active_teams: [], resting_team: "synthetic",
        scores: { trade_score: 1, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [
          { room_id: "trade_1", final_efficiency: 1.75, total_efficiency: 1.25, order_multiplier: 1.4 },
          { room_id: "power_1", order_multiplier: 1 },
        ] }, weighted_trade: 1, weighted_manu: 0, weighted_power: 0,
      })),
      daily: { trade: 1, manufacture: 0, power: 0, production: { lmd: 100, pure_gold: 0, battle_records: 0, originium_shards: 0, orundum: 0 } },
    },
    durationMs: 87654321, diagnosticId: "synthetic-diagnostic",
    debug: { stdout: "synthetic-private", stderr: "synthetic-private", command: "synthetic-private" },
  };
}

function contextFor(plan = syntheticPlan()): AgentContextSnapshot {
  return {
    schemaVersion: 1, contextRevision: "synthetic-revision", sampledAt: "2026-09-07T00:00:00.000Z", activeShift: 1,
    currentPlan: createSafeCurrentPlanSnapshot({ plan, layout, includeRoomDetails: true }),
  };
}

function roomsOf(snapshot: AgentContextSnapshot): SafeCurrentPlanRoom[] {
  assert.ok(snapshot.currentPlan?.rooms);
  return snapshot.currentPlan.rooms;
}
function detail(result: CurrentPlanRoomDetailResult) {
  assert.ok("data" in result && result.data);
  return result.data;
}
function run(roomRef = "trade_1", shiftIndex: number | null = null, snapshot = contextFor()) {
  return executeCurrentPlanRoomDetail({ roomRef, shiftIndex }, { snapshot });
}
function addObserved(snapshot: AgentContextSnapshot) {
  snapshot.observedSchedule = {
    source: { type: "skland_schedule" }, sampledAt: "2025-01-01T00:00:00.000Z",
    rooms: [{ kind: "trade_post", index: 0, operators: ["观测甲", "观测丁"] }],
  };
  return snapshot;
}

test("declares read-only strict input and trims references", () => {
  assert.equal(CURRENT_PLAN_ROOM_DETAIL_TOOL.name, "current_plan.get_room_detail");
  assert.equal(CURRENT_PLAN_ROOM_DETAIL_TOOL.effect, "read");
  assert.equal(CURRENT_PLAN_ROOM_DETAIL_TOOL.inputSchema.additionalProperties, false);
  assert.deepEqual(CURRENT_PLAN_ROOM_DETAIL_TOOL.inputSchema.required, ["roomRef", "shiftIndex"]);
  assert.deepEqual(parseCurrentPlanRoomDetailInput({ roomRef: "  trade_1  ", shiftIndex: null }), { roomRef: "trade_1", shiftIndex: null });
  assert.deepEqual(parseCurrentPlanRoomDetailInput({ roomRef: "贸易站 1", shiftIndex: 0 }), { roomRef: "贸易站 1", shiftIndex: 0 });
});
const invalidInputs: Array<[string, unknown]> = [
  ["missing roomRef", { shiftIndex: null }], ["missing shiftIndex", { roomRef: "trade_1" }],
  ["empty", { roomRef: " \t ", shiftIndex: null }],
  ["overlong", { roomRef: "a".repeat(MAX_CURRENT_PLAN_ROOM_REF_LENGTH + 1), shiftIndex: null }],
  ["nonstring roomRef", { roomRef: 1, shiftIndex: null }],
  ...[1.5, -1, NaN, Infinity, "0", undefined, Number.MAX_SAFE_INTEGER + 1].map((value): [string, unknown] => [
    `invalid shift ${String(value)}`, { roomRef: "trade_1", shiftIndex: value },
  ]),
  ["null", null], ["array", []], ["string", "{}"],
  ...["includeObserved", "observedSchedule", "currentPlan", "contextRevision", "diagnosticId", "sampledAt", "userId", "workspaceId", "permissions"].map((key): [string, unknown] => [
    `forbidden argument ${key}`, { roomRef: "trade_1", shiftIndex: null, [key]: true },
  ]),
];
for (const [name, input] of invalidInputs) test(`input rejects ${name}`, () => {
  assert.throws(() => executeCurrentPlanRoomDetail(input, { snapshot: contextFor() }),
    (error: unknown) => error instanceof CurrentPlanRoomDetailInputError && error.code === "AGENT_TOOL_INVALID_INPUT");
});

test("parses optional v1 context extensions and retains missing-plan source", () => {
  const snapshot = addObserved(contextFor());
  assert.equal(AGENT_CONTEXT_SCHEMA_VERSION, 1);
  assert.deepEqual(parseAgentContextSnapshot(snapshot), snapshot);
  validateAgentContextSnapshot(snapshot);
  const missing = run("trade_1", null, { ...snapshot, activeShift: 0, currentPlan: null });
  assert.equal(missing.status, "missing");
  assert.ok("issue" in missing);
  assert.equal(missing.issue.code, "NO_CURRENT_PLAN");
  assert.deepEqual(missing.source, { type: "current_context", contextRevision: "synthetic-revision", planDiagnosticId: null, sampledAt: snapshot.sampledAt });
});

test("validates context metadata and cross-field active shift independently of arguments", () => {
  const snapshot = contextFor();
  for (const patch of [{ contextRevision: "bad revision" }, { sampledAt: "2026-02-30T00:00:00.000Z" }, { activeShift: -1 }, { currentPlan: { ...snapshot.currentPlan, debug: {} } }]) {
    assert.throws(() => executeCurrentPlanRoomDetail({ roomRef: "trade_1", shiftIndex: 0 }, { snapshot: { ...snapshot, ...patch } }), AgentContextShapeError);
  }
  assert.throws(() => run("trade_1", 0, { ...snapshot, activeShift: 2 }), AgentContextContractError);
});

test("rejects excessive room, shift, operator, text and serialized context sizes", () => {
  const mutations: Array<(snapshot: AgentContextSnapshot) => void> = [
    (s) => { roomsOf(s).push(...Array.from({ length: 65 }, () => structuredClone(roomsOf(s)[0]))); },
    (s) => { roomsOf(s)[0].shifts.push(...Array.from({ length: 13 }, () => structuredClone(roomsOf(s)[0].shifts[0]))); },
    (s) => { roomsOf(s)[0].shifts[0].operators = Array(MAX_AGENT_ROOM_OPERATORS + 1).fill("合成"); },
    (s) => { roomsOf(s)[0].label = "x".repeat(MAX_AGENT_ROOM_TEXT_LENGTH + 1); },
    (s) => { roomsOf(s)[0].label = "x".repeat(MAX_AGENT_CONTEXT_BYTES); },
    (s) => { roomsOf(s)[0].shifts[0].efficiency = { final_efficiency: Infinity }; },
    (s) => { roomsOf(s)[0].shifts[0].operators = Array(2); },
    (s) => { s.observedSchedule = { source: { type: "skland_schedule" }, sampledAt: "bad", rooms: [] }; },
    (s) => { s.observedSchedule = { source: { type: "skland_schedule" }, sampledAt: s.sampledAt, rooms: Array(65).fill({ kind: "trade_post", index: 0, operators: [] }) }; },
    (s) => { addObserved(s); assert.ok(s.observedSchedule); s.observedSchedule.rooms[0].operators = Array(MAX_AGENT_ROOM_OPERATORS + 1).fill("合成"); },
    (s) => { roomsOf(s)[0].label = "合成\u0000房间"; },
  ];
  for (const mutate of mutations) {
    const snapshot = contextFor(); mutate(snapshot);
    assert.throws(() => run("trade_1", 0, snapshot), AgentContextShapeError);
  }
});

test("rejects duplicate room identities, ambiguous observed associations and incomplete catalogs", () => {
  for (const mutate of [
    (s: AgentContextSnapshot) => { roomsOf(s)[0].roomId = roomsOf(s)[1].roomId; },
    (s: AgentContextSnapshot) => { roomsOf(s)[0].layoutOrder = roomsOf(s)[1].layoutOrder; },
    (s: AgentContextSnapshot) => { roomsOf(s)[0].index = roomsOf(s)[1].index; },
    (s: AgentContextSnapshot) => { roomsOf(s).pop(); },
    (s: AgentContextSnapshot) => { roomsOf(s)[0].shifts.pop(); },
    (s: AgentContextSnapshot) => { addObserved(s); assert.ok(s.observedSchedule); s.observedSchedule.rooms.push(structuredClone(s.observedSchedule.rooms[0])); },
  ]) {
    const s = contextFor(); mutate(s);
    assert.throws(() => run("trade_1", null, s), AgentContextContractError);
  }
});

for (const ref of ["trade_1", "贸易站 1", "  贸易站   1 \n", "贸易站\t1"]) test(`resolves ${JSON.stringify(ref)}`, () => {
  const result = run(ref, 0);
  assert.equal(result.status, "ok");
  assert.deepEqual(detail(result).room, { roomId: "trade_1", label: "贸易站 1", kind: "trade_post", index: 0, level: 2 });
});

for (const ref of ["贸易站", "trade_post", "TRADE_POST", "trade", "trading"]) test(`ambiguity never picks the first: ${ref}`, () => {
  const snapshot = contextFor();
  const first = run(ref, null, snapshot);
  assert.equal(first.status, "ambiguous");
  if (first.status !== "ambiguous") throw new Error("expected ambiguity");
  assert.equal(first.issue.code, "ROOM_AMBIGUOUS");
  assert.deepEqual(first.candidates.map((room) => room.roomId), ["trade_2", "trade_1"]);
  roomsOf(snapshot).reverse();
  assert.deepEqual(run(ref, null, snapshot), first);
  assert.equal("data" in first, false);
});

test("exact ID precedes labels; labels precede aliases; unknown refs are not fuzzy matched", () => {
  const s = contextFor(); roomsOf(s)[0].label = "trade_1";
  assert.equal(detail(run("trade_1", 0, s)).room.roomId, "trade_1");
  roomsOf(s)[0].label = "贸易站";
  assert.equal(detail(run("贸易站", 0, s)).room.roomId, "trade_2");
  for (const ref of ["trade_99", "贸易站一", "trade_", "制造战"]) {
    const result = run(ref);
    assert.equal(result.status, "missing");
    assert.ok("issue" in result); assert.equal(result.issue.code, "ROOM_NOT_FOUND");
  }
});

test("selects active/explicit array positions, not rotation metadata; never clamps or wraps", () => {
  const active = detail(run());
  assert.deepEqual(active.shift, { requestedShiftIndex: null, resolvedShiftIndex: 1, usedActiveShift: true, durationHours: 6 });
  assert.deepEqual(active.planned.operators, ["计划乙"]);
  const explicit = detail(run("trade_1", 0));
  assert.deepEqual(explicit.shift, { requestedShiftIndex: 0, resolvedShiftIndex: 0, usedActiveShift: false, durationHours: 12 });
  assert.deepEqual(explicit.planned.operators, ["计划甲", "计划丙 S1"]);
  for (const index of [2, 7, 99, Number.MAX_SAFE_INTEGER]) {
    const result = run("trade_1", index);
    assert.equal(result.status, "unavailable"); assert.ok("issue" in result);
    assert.equal(result.issue.code, "SHIFT_NOT_FOUND");
    assert.ok("shift" in result); assert.equal(result.shift.resolvedShiftIndex, index);
  }
});

test("distinguishes empty assignments from missing room/training data and a legacy catalog", () => {
  const empty = run("trade_2", 0);
  assert.equal(empty.status, "ok"); assert.equal(detail(empty).planned.status, "empty");
  assert.deepEqual(detail(empty).planned.operators, []);
  for (const ref of ["workshop", "training_room"]) {
    const missing = run(ref, 0);
    assert.equal(missing.status, "unavailable");
    assert.equal(detail(missing).planned.status, "unavailable");
    assert.equal(detail(missing).planned.operators, null);
  }
  const snapshot = contextFor(); assert.ok(snapshot.currentPlan); delete snapshot.currentPlan.rooms;
  const legacy = run("trade_1", 0, snapshot);
  assert.equal(legacy.status, "unavailable"); assert.ok("issue" in legacy);
  assert.equal(legacy.issue.code, "ROOM_DATA_UNAVAILABLE");
});

test("explicit training nulls are empty; known training slots use display names", () => {
  const plan = syntheticPlan();
  plan.trainingRoom = { schema_version: 1, shifts: [{ trainee: null, trainer: null }, { trainee: "合成学员", trainer: "合成教官" }] };
  assert.equal(detail(run("training_room", 0, contextFor(plan))).planned.status, "empty");
  assert.deepEqual(detail(run("训练室", 1, contextFor(plan))).planned.operators, ["合成学员", "合成教官"]);
});

test("missing MAA rows retain canonical identity without using layout order as observed index", () => {
  const plan = syntheticPlan();
  for (const shift of plan.maa.plans) delete shift.rooms.trading;
  const snapshot = addObserved(contextFor(plan));
  const first = run("trade_1", 0, snapshot);
  assert.equal(first.status, "unavailable");
  assert.equal(detail(first).room.label, "贸易站 1");
  assert.equal(detail(first).room.index, 0);
  assert.equal(detail(first).planned.operators, null);
  assert.equal(detail(first).observed.status, "available");
  const second = detail(run("trade_2", 0, snapshot));
  assert.equal(second.room.label, "贸易站 2");
  assert.equal(second.room.index, 1);
  assert.equal(second.observed.status, "unavailable");
});

test("custom IDs with no domain association do not guess an observed room", () => {
  const plan = syntheticPlan();
  for (const shift of plan.maa.plans) delete shift.rooms.trading;
  const customLayout = structuredClone(layout);
  customLayout.rooms[0].id = "synthetic_custom_room";
  const snapshot = addObserved(contextFor(plan));
  snapshot.currentPlan = createSafeCurrentPlanSnapshot({ plan, layout: customLayout, includeRoomDetails: true });
  const result = detail(run("synthetic_custom_room", 0, snapshot));
  assert.equal(result.room.index, null);
  assert.equal(result.planned.status, "unavailable");
  assert.equal(result.observed.status, "unavailable");
});

test("all nine kinds reuse public room IDs and labels; implicit dorm autofill is not empty", () => {
  const allRooms: BaseBlueprint = { ...layout, rooms: [
    ...layout.rooms,
    { id: "control", kind: "control_center", level: 5 },
    { id: "manu_1", kind: "factory", level: 3 },
    { id: "dorm_1", kind: "dormitory", level: 5 },
    { id: "office", kind: "office", level: 3 },
    { id: "meeting", kind: "meeting_room", level: 3 },
  ] };
  const plan = syntheticPlan();
  for (const shift of plan.maa.plans) Object.assign(shift.rooms, {
    control: [{ operators: ["合成中枢"] }], manufacture: [{ operators: ["合成制造"], product: "Battle Record" }],
    dormitory: [{ operators: [] }], hire: [{ operators: [] }], meeting: [{ operators: [] }], processing: [{ operators: [] }],
  });
  const snapshot = contextFor(plan);
  snapshot.currentPlan = createSafeCurrentPlanSnapshot({ plan, layout: allRooms, includeRoomDetails: true });
  for (const row of planToRows(plan.maa.plans[0], plan.rotation.shifts[0], allRooms)) {
    const result = detail(run(row.roomId, 0, snapshot));
    assert.equal(result.room.label, row.title);
    assert.equal(result.room.index, row.index);
  }
  assert.equal(detail(run("dorm_1", 0, snapshot)).planned.status, "unavailable");
  assert.equal(detail(run("office", 0, snapshot)).planned.status, "empty");
  assert.equal(detail(run("manu_1", 0, snapshot)).planned.product, "作战记录");
});

test("duplicate MAA singleton IDs fail closed instead of choosing the first", () => {
  const plan = syntheticPlan();
  plan.maa.plans[0].rooms.processing = [{ operators: [] }, { operators: [] }];
  assert.throws(() => contextFor(plan), AgentContextContractError);
});

test("indirect/omitted occupancy is unavailable, not guessed from groups or autofill", () => {
  for (const patch of [{ operators: undefined }, { skip: true }, { use_operator_groups: true }, { autofill: true }, { operators: [{}] }]) {
    const plan = syntheticPlan(); assert.ok(plan.maa.plans[0].rooms.trading);
    Object.assign(plan.maa.plans[0].rooms.trading[0], patch);
    assert.equal(detail(run("trade_1", 0, contextFor(plan))).planned.status, "unavailable");
  }
});

test("copies only actual public efficiency; does not compute Lancet fallback or use durationMs", () => {
  const plan = syntheticPlan();
  const first = run("trade_1", 0, contextFor(plan));
  assert.deepEqual(detail(first).planned.efficiency, { final_efficiency: 1.75, total_efficiency: 1.25, order_multiplier: 1.4 });
  assert.equal(detail(first).planned.product, "龙门商法");
  assert.deepEqual(detail(run("power_1", 0)).planned.efficiency, { order_multiplier: 1 });
  plan.durationMs = 1;
  assert.deepEqual(run("trade_1", 0, contextFor(plan)), first);
});

test("keeps planned/observed/source timestamps separate without inventing freshness", () => {
  const snapshot = addObserved(contextFor());
  const result = run("trade_1", 0, snapshot);
  assert.equal(result.status, "ok");
  assert.deepEqual(detail(result).planned.operators, ["计划甲", "计划丙 S1"]);
  assert.deepEqual(detail(result).observed, { status: "available", operators: ["观测甲", "观测丁"], sampledAt: "2025-01-01T00:00:00.000Z", source: { type: "skland_schedule" } });
  assert.deepEqual(result.source, { type: "current_context", contextRevision: "synthetic-revision", planDiagnosticId: "synthetic-diagnostic", sampledAt: snapshot.sampledAt });
  assert.ok(detail(result).limitations.includes("OBSERVED_SNAPSHOT_AT_SAMPLED_AT"));
  assert.deepEqual(run("trade_1", 0, snapshot), result);
});

test("observed absence/missing room/explicit empty stay distinct, and do not change planned", () => {
  assert.equal(run().status, "ok");
  assert.deepEqual(detail(run()).observed, { status: "unavailable", issue: { code: "OBSERVED_DATA_UNAVAILABLE", reason: "NO_OBSERVED_SNAPSHOT" } });
  const snapshot = addObserved(contextFor());
  const other = detail(run("trade_2", 0, snapshot)).observed;
  assert.equal(other.status, "unavailable");
  assert.equal(other.sampledAt, snapshot.observedSchedule?.sampledAt);
  assert.ok(snapshot.observedSchedule); snapshot.observedSchedule.rooms[0].operators = [];
  const empty = detail(run("trade_1", 0, snapshot)).observed;
  assert.equal(empty.status, "available"); assert.ok("operators" in empty); assert.deepEqual(empty.operators, []);
});

const sensitiveKeys = ["debug", "cred", "credential", "cookie", "token", "authorization", "session", "accountUid", "userId", "deviceId", "avatarUrl", "inventory", "orders", "rawResponse", "stdout", "stderr", "operBox", "connectionString", "internalPath", "fallbackUsed", "solverAttempts", "providerMetadata"];
function assertNoSensitiveKeys(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!sensitiveKeys.some((forbidden) => key.toLowerCase() === forbidden.toLowerCase()), key);
    assertNoSensitiveKeys(child);
  }
}

test("projects synthetic Skland data by group/index, strips all IDs and does not infer missing sampling time", () => {
  const schedule: SklandScheduleSnapshot = {
    roles: [], operbox: [], sourceName: "合成", warnings: [],
    infrastructure: { storeTs: 1_735_689_600, layoutLabel: null, layoutSuggestion: null, layoutWarning: null, tiredOperators: [], rooms: [
      { key: "raw-slot-id", group: "trading", index: 0, level: 3, operators: [{ id: "private-operator-id", name: "观测合成", morale: 20 }] },
    ] },
  };
  const decorated = Object.assign(schedule, Object.fromEntries(sensitiveKeys.map((key) => [key, "synthetic-private"])));
  const observed = createSafeObservedScheduleSnapshot(decorated);
  assert.deepEqual(observed, { source: { type: "skland_schedule" }, sampledAt: "2025-01-01T00:00:00.000Z", rooms: [{ kind: "trade_post", index: 0, operators: ["观测合成"] }] });
  assertNoSensitiveKeys(observed);
  assert.equal(JSON.stringify(observed).includes("private-operator-id"), false);
  assert.equal(JSON.stringify(observed).includes("morale"), false);
  schedule.infrastructure.storeTs = null;
  assert.equal(createSafeObservedScheduleSnapshot(schedule), null);
});

test("rejects sensitive extras recursively at the safe boundary and never leaks upstream additions", () => {
  const plan = syntheticPlan();
  const expected = contextFor(plan);
  const extras = Object.fromEntries(sensitiveKeys.map((key) => [key, "synthetic-private"]));
  Object.assign(plan, extras); Object.assign(plan.rotation, extras); Object.assign(plan.profile, extras);
  for (const shift of plan.rotation.shifts) for (const line of shift.scores.room_lines) Object.assign(line, extras);
  const safe = contextFor(plan);
  assert.deepEqual(safe, expected);
  assertNoSensitiveKeys(safe);
  const result = run("trade_1", 0, safe);
  assertNoSensitiveKeys(result);
  for (const key of ["currentPlan", "snapshot", "maa", "rotation", "durationMs"]) assert.equal(JSON.stringify(result).includes(`"${key}"`), false);
  for (const key of sensitiveKeys) {
    for (const target of ["room", "assignment", "efficiency", "observed", "observedRoom", "source"] as const) {
      const s = addObserved(contextFor()); assert.ok(s.observedSchedule);
      const r = roomsOf(s)[0]; r.shifts[0].efficiency = {};
      const targets = { room: r, assignment: r.shifts[0], efficiency: r.shifts[0].efficiency, observed: s.observedSchedule, observedRoom: s.observedSchedule.rooms[0], source: s.observedSchedule.source };
      Object.assign(targets[target], { [key]: "synthetic-private" });
      assert.throws(() => run("trade_1", 0, s), AgentContextShapeError);
    }
  }
});

test("candidate truncation counts omitted rooms, searches full catalog, and preserves layout order", () => {
  const s = contextFor(); assert.ok(s.currentPlan);
  const original = roomsOf(s)[1];
  s.currentPlan.rooms = Array.from({ length: 12 }, (_, i) => ({ ...structuredClone(original), roomId: `trade_${i + 1}`, label: `贸易站 ${i + 1}`, index: i, layoutOrder: i }));
  s.currentPlan.roomCounts = [{ kind: "trade_post", count: 12 }];
  const first = run("贸易站", null, s);
  assert.equal(first.status, "ambiguous"); if (first.status !== "ambiguous") throw new Error("expected ambiguous");
  assert.equal(first.candidates.length, MAX_ROOM_DETAIL_CANDIDATES);
  assert.deepEqual(first.truncation, { applied: true, omittedCount: 4 });
  assert.equal(detail(run("trade_12", 0, s)).room.roomId, "trade_12");
  s.currentPlan.rooms.reverse(); assert.deepEqual(run("贸易站", null, s), first);
});

test("planned and observed operator truncation is structural, exact and nonmutating", () => {
  const s = addObserved(contextFor()); assert.ok(s.observedSchedule);
  roomsOf(s)[1].shifts[0].operators = Array.from({ length: 8 }, (_, i) => `计划${i}`);
  s.observedSchedule.rooms[0].operators = Array.from({ length: 9 }, (_, i) => `观测${i}`);
  const before = structuredClone(s);
  const result = run("trade_1", 0, s);
  assert.equal(detail(result).planned.operators?.length, 5);
  assert.deepEqual(result.truncation, { applied: true, omittedCount: 7 });
  assert.deepEqual(s, before);
  assert.deepEqual(run("trade_1", 0, s), result);
});

test("enforces UTF-8 byte budget by removing complete items and reports every omission", () => {
  const s = addObserved(contextFor()); assert.ok(s.observedSchedule);
  const r = roomsOf(s)[1]; r.label = "😀".repeat(128);
  r.shifts[0].operators = Array(5).fill("😀".repeat(128));
  r.shifts[0].efficiency = Object.fromEntries(AGENT_ROOM_EFFICIENCY_FIELDS.map((key) => [key, 123456789.12345]));
  s.observedSchedule.rooms[0].operators = Array(5).fill("😀".repeat(128));
  const result = run("trade_1", 0, s);
  const data = detail(result); assert.equal(data.observed.status, "available");
  assert.ok("operators" in data.observed);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength <= MAX_ROOM_DETAIL_RESULT_BYTES);
  assert.equal(result.truncation.applied, true);
  assert.equal(result.truncation.omittedCount, 10 - (data.planned.operators?.length ?? 0) - data.observed.operators.length + (data.planned.efficiency === null ? 1 : 0));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(run("trade_1", 0, s), result);
});
