import assert from "node:assert/strict";
import test from "node:test";

import type { BaseBlueprint, PublicPlanData } from "../../../types.ts";
import {
  AgentContextContractError,
  AgentContextShapeError,
  MAX_AGENT_CONTEXT_BYTES,
  createSafeCurrentPlanSnapshot,
  parseAgentContextSnapshot,
  validateAgentContextSnapshot,
  type AgentContextSnapshot,
} from "../context-contract.ts";
import {
  CURRENT_PLAN_SUMMARY_TOOL,
  CurrentPlanToolInputError,
  MAX_CURRENT_PLAN_SUMMARY_RESULT_BYTES,
  executeCurrentPlanSummary,
  parseCurrentPlanSummaryInput,
} from "./current-plan-summary.ts";

const layout: BaseBlueprint = {
  template: "synthetic-243",
  drone_cap: 200,
  scenario: {},
  rooms: [
    { id: "control", kind: "control_center", level: 5 },
    { id: "trade_1", kind: "trade_post", level: 3, product: { trade: { order: "gold" } } },
    { id: "manu_1", kind: "factory", level: 3, product: { factory: { recipe: "gold" } } },
    { id: "power_1", kind: "power_plant", level: 3 },
    { id: "dorm_1", kind: "dormitory", level: 5, dorm_beds: 5 },
    { id: "office", kind: "office", level: 3 },
    { id: "meeting", kind: "meeting_room", level: 3 },
    { id: "workshop", kind: "workshop", level: 3 },
    { id: "training_room", kind: "training_room", level: 3 },
  ],
};

function syntheticPlan({
  shiftCount = 2,
  solverProduction = true,
  training = true,
}: {
  shiftCount?: number;
  solverProduction?: boolean;
  training?: boolean;
} = {}): PublicPlanData {
  const shifts = Array.from({ length: shiftCount }, (_, index) => ({
    index,
    duration_hours: shiftCount === 2 ? 12 : 4,
    active_teams: ["synthetic-active"],
    resting_team: "synthetic-resting",
    scores: {
      trade_score: 1,
      manu_prod_sum: 200,
      power_charge_sum: 100,
      room_lines: [
        { room_id: "trade_1", final_efficiency: 1 },
        { room_id: "manu_1", final_efficiency: 2 },
        { room_id: "power_1", final_efficiency: 1 },
      ],
    },
    weighted_trade: 1,
    weighted_manu: 2,
    weighted_power: 1,
  }));
  const plans = Array.from({ length: shiftCount }, (_, index) => ({
    name: `合成班次 ${index + 1}`,
    rooms: {
      control: [{ operators: ["合成中枢干员"] }],
      trading: [{ operators: ["合成贸易干员"], product: "LMD" }],
      manufacture: [{ operators: [{ name: "合成制造干员", skill: 1 }], product: "Gold" }],
      power: [{ operators: ["合成发电干员"] }],
      dormitory: [{ operators: ["合成宿舍干员甲", "合成宿舍干员乙"] }],
      meeting: [{ operators: ["合成会客室干员"] }],
      hire: [{ operators: ["合成办公室干员"] }],
      processing: [{ operators: [] }],
    },
  }));

  return {
    profile: {
      schema_version: 4,
      rotation_profile: "main_backup_12_12",
      layout_label: "合成 243 布局",
      operbox_label: "合成干员数据",
      baseline_label: "产品推荐基准",
      summary: { owned: 42, tier_up_owned: 30, trade_pool_ready: 5 },
      domains: [],
      rotation: {},
      baseline_rotation: {},
      actions: [],
      flags: [],
      narration_hints: [],
    },
    maa: { title: "合成排班", plans },
    rotation: {
      profile: "main_backup_12_12",
      shifts,
      daily: {
        trade: 1,
        manufacture: 2,
        power: 1,
        ...(solverProduction
          ? {
              production: {
                lmd: 34_254,
                pure_gold: 50_000,
                battle_records: 22_400,
                originium_shards: 48,
                orundum: 360,
              },
            }
          : {}),
      },
    },
    ...(training
      ? {
          trainingRoom: {
            schema_version: 1,
            shifts: Array.from({ length: shiftCount }, (_, index) => ({
              trainee: index % 2 === 0 ? "合成训练对象" : null,
              trainer: "合成协助干员",
            })),
          },
        }
      : {}),
    durationMs: 99_999,
    diagnosticId: "diagnostic-synthetic-1",
    debug: {
      command: "must-not-leak",
      stdout: "synthetic private stdout",
      stderr: "synthetic private stderr",
    },
  };
}

function contextFor(
  plan: PublicPlanData | null = syntheticPlan(),
  activeShift = plan && plan.maa.plans.length > 1 ? 1 : 0,
): AgentContextSnapshot {
  return {
    schemaVersion: 1,
    contextRevision: "context-revision-7",
    sampledAt: "2026-09-04T08:00:00.000Z",
    activeShift,
    currentPlan: plan ? createSafeCurrentPlanSnapshot({ plan, layout }) : null,
  };
}

function expectContextShapeError(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof AgentContextShapeError);
    assert.equal(error.code, "AGENT_CONTEXT_INVALID_SHAPE");
    return true;
  });
}

function keysDeep(value: unknown, keys = new Set<string>()): Set<string> {
  if (value === null || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    keysDeep(child, keys);
  }
  return keys;
}

test("declares and enforces a strict empty tool input", () => {
  assert.deepEqual(CURRENT_PLAN_SUMMARY_TOOL, {
    name: "current_plan.get_summary",
    effect: "read",
    description: "读取用户当前页面提供的排班方案公开摘要。不重新求解，不读取数据库，不修改任何数据。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  });
  assert.deepEqual(parseCurrentPlanSummaryInput({}), {});

  for (const value of [{ activeShift: 0 }, null, [], "{}"]) {
    assert.throws(
      () => parseCurrentPlanSummaryInput(value),
      (error: unknown) => error instanceof CurrentPlanToolInputError
        && error.code === "AGENT_TOOL_INVALID_INPUT",
    );
  }
});

test("parses valid minimal contexts with and without a current plan", () => {
  const withPlan = contextFor();
  assert.deepEqual(parseAgentContextSnapshot(withPlan), withPlan);
  assert.doesNotThrow(() => validateAgentContextSnapshot(withPlan));

  const withoutPlan = contextFor(null, 0);
  assert.deepEqual(parseAgentContextSnapshot(withoutPlan), withoutPlan);
  assert.doesNotThrow(() => validateAgentContextSnapshot(withoutPlan));
});

test("rejects missing, malformed, overlong, and additional context fields", () => {
  const valid = contextFor();
  const missingSampledAt: Record<string, unknown> = { ...valid };
  delete missingSampledAt.sampledAt;
  expectContextShapeError(() => parseAgentContextSnapshot(missingSampledAt));
  expectContextShapeError(() => parseAgentContextSnapshot({
    ...valid,
    contextRevision: "invalid revision with spaces",
  }));
  expectContextShapeError(() => parseAgentContextSnapshot({
    ...valid,
    contextRevision: "r".repeat(81),
  }));
  expectContextShapeError(() => parseAgentContextSnapshot({
    ...valid,
    sampledAt: "2026-02-30T08:00:00.000Z",
  }));
  expectContextShapeError(() => parseAgentContextSnapshot({ ...valid, activeShift: 12 }));
  expectContextShapeError(() => parseAgentContextSnapshot({ ...valid, userId: "forbidden" }));

  const nestedAdditional = structuredClone(valid);
  if (!nestedAdditional.currentPlan) throw new Error("synthetic plan missing");
  expectContextShapeError(() => parseAgentContextSnapshot({
    ...nestedAdditional,
    currentPlan: { ...nestedAdditional.currentPlan, debug: { stdout: "forbidden" } },
  }));
});

test("rejects oversized arrays and oversized serialized snapshots before execution", () => {
  expectContextShapeError(() => parseAgentContextSnapshot(contextFor(syntheticPlan({ shiftCount: 13 }), 0)));

  const oversized = structuredClone(contextFor());
  if (!oversized.currentPlan) throw new Error("synthetic plan missing");
  oversized.currentPlan.profile.layoutLabel = "x".repeat(MAX_AGENT_CONTEXT_BYTES);
  expectContextShapeError(() => parseAgentContextSnapshot(oversized));
});

test("separates context shape errors from cross-field contract violations", () => {
  const invalid = contextFor(syntheticPlan(), 2);
  const parsed = parseAgentContextSnapshot(invalid);
  assert.throws(
    () => validateAgentContextSnapshot(parsed),
    (error: unknown) => error instanceof AgentContextContractError
      && error.code === "AGENT_CONTEXT_CONTRACT_VIOLATION",
  );
  assert.throws(
    () => executeCurrentPlanSummary({}, { snapshot: invalid }),
    (error: unknown) => error instanceof AgentContextContractError,
  );
});

test("returns a deterministic safe summary with source metadata kept separate", () => {
  const context = contextFor();
  const result = executeCurrentPlanSummary({}, { snapshot: context });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected ok result");
  assert.deepEqual(result.source, {
    type: "current_context",
    contextRevision: "context-revision-7",
    planDiagnosticId: "diagnostic-synthetic-1",
    sampledAt: "2026-09-04T08:00:00.000Z",
  });
  assert.equal(result.data.shiftCount, 2);
  assert.deepEqual(result.data.activeShift, {
    index: 1,
    durationHours: 12,
    plannedRoomCount: 9,
    plannedOccupiedSlots: 9,
  });
  assert.equal(result.data.rooms.total, 9);
  assert.deepEqual(result.data.rooms.byKind.map(({ kind, count }) => [kind, count]), [
    ["control_center", 1],
    ["trade_post", 1],
    ["factory", 1],
    ["power_plant", 1],
    ["dormitory", 1],
    ["office", 1],
    ["meeting_room", 1],
    ["workshop", 1],
    ["training_room", 1],
  ]);
  assert.equal(result.data.profile.ownedOperatorCount, 42);
  assert.equal(result.data.training.status, "available");
  if (result.data.training.status === "available") {
    assert.deepEqual(result.data.training.assignments[1], {
      shiftIndex: 1,
      traineeAssigned: false,
      trainerAssigned: true,
    });
  }
  assert.equal(result.source.contextRevision === result.source.planDiagnosticId, false);
  assert.deepEqual(executeCurrentPlanSummary({}, { snapshot: context }), result);
});

test("returns NO_CURRENT_PLAN as a stable missing business result", () => {
  const result = executeCurrentPlanSummary({}, { snapshot: contextFor(null, 0) });

  assert.equal(result.status, "missing");
  if (result.status !== "missing") throw new Error("expected missing result");
  assert.equal(result.issue.code, "NO_CURRENT_PLAN");
  assert.equal(result.source.type, "current_context");
  assert.equal(result.source.planDiagnosticId, null);
  assert.equal(result.source.sampledAt, "2026-09-04T08:00:00.000Z");
  assert.deepEqual(result.truncation, { applied: false, omittedCount: 0 });
});

test("uses authoritative solver totals before the deterministic estimate", () => {
  const result = executeCurrentPlanSummary({}, { snapshot: contextFor() });
  assert.notEqual(result.status, "missing");
  if (result.status === "missing") throw new Error("expected plan result");

  assert.deepEqual(result.data.production, {
    source: "solver",
    values: {
      lmd: 34_254,
      pureGold: 100,
      experience: 22_400,
      originiumShards: 48,
      orundum: 360,
    },
  });
});

test("marks existing estimator output as estimate without mixing solver totals", () => {
  const plan = syntheticPlan({ solverProduction: false });
  const result = executeCurrentPlanSummary({}, { snapshot: contextFor(plan) });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected ok estimate result");

  assert.equal(result.data.production.source, "estimate");
  if (result.data.production.source !== "estimate") throw new Error("expected estimate production");
  assert.equal(result.data.production.values.lmd, 10_265);
  assert.equal(result.data.production.values.pureGold, 40);
  assert.equal(result.data.production.values.experience, 0);
  assert.deepEqual(result.data.production.unavailable, []);
});

test("returns stable unavailable reasons when production or training cannot be summarized", () => {
  const planWithoutShifts = syntheticPlan({ shiftCount: 0, solverProduction: false });
  const unavailable = executeCurrentPlanSummary({}, { snapshot: contextFor(planWithoutShifts, 0) });
  assert.equal(unavailable.status, "unavailable");
  if (unavailable.status !== "unavailable") throw new Error("expected unavailable result");
  assert.equal(unavailable.issue.code, "CURRENT_PLAN_SHIFT_DATA_UNAVAILABLE");
  assert.deepEqual(unavailable.data.production, {
    source: "unavailable",
    reason: "MISSING_SHIFT_DATA",
    unavailable: [],
  });

  const noTraining = executeCurrentPlanSummary({}, {
    snapshot: contextFor(syntheticPlan({ training: false })),
  });
  assert.equal(noTraining.status, "ok");
  if (noTraining.status !== "ok") throw new Error("expected ok result without training");
  assert.deepEqual(noTraining.data.training, {
    status: "unavailable",
    reason: "NO_TRAINING_SCHEDULE",
  });
  assert.deepEqual(noTraining.data.limitations, [{
    code: "TRAINING_SUMMARY_UNAVAILABLE",
    reason: "NO_TRAINING_SCHEDULE",
  }]);
});

test("structurally truncates bounded arrays and reports the exact omitted item count", () => {
  const context = contextFor(syntheticPlan({ shiftCount: 6 }), 5);
  const first = executeCurrentPlanSummary({}, { snapshot: context });
  const second = executeCurrentPlanSummary({}, { snapshot: context });
  assert.equal(first.status, "ok");
  if (first.status !== "ok") throw new Error("expected truncated ok result");

  assert.equal(first.data.shifts.length, 4);
  assert.equal(first.data.training.status, "available");
  if (first.data.training.status === "available") {
    assert.equal(first.data.training.assignments.length, 4);
  }
  assert.deepEqual(first.data.activeShift, {
    index: 5,
    durationHours: 4,
    plannedRoomCount: 9,
    plannedOccupiedSlots: 9,
  });
  assert.deepEqual(first.truncation, { applied: true, omittedCount: 4 });
  assert.deepEqual(second, first);
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).byteLength <= MAX_CURRENT_PLAN_SUMMARY_RESULT_BYTES);
});

test("never returns the raw snapshot, debug data, operator names, or sensitive keys", () => {
  const plan = syntheticPlan();
  const safePlan = createSafeCurrentPlanSnapshot({ plan, layout });
  assert.equal("debug" in safePlan, false);
  assert.equal("durationMs" in safePlan, false);
  assert.equal("maa" in safePlan, false);
  assert.equal("rotation" in safePlan, false);

  const result = executeCurrentPlanSummary({}, { snapshot: contextFor(plan) });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("合成贸易干员"), false);
  assert.equal(serialized.includes("99999"), false);
  assert.equal("currentPlan" in result, false);

  const keys = [...keysDeep(result)].map((key) => key.toLowerCase());
  for (const forbidden of [
    "debug",
    "cred",
    "cookie",
    "token",
    "stdout",
    "stderr",
    "operbox",
    "userid",
    "connectionstring",
    "durationms",
  ]) {
    assert.equal(keys.some((key) => key.includes(forbidden)), false, `must not expose ${forbidden}`);
  }
});

test("optional v1 room and observed projections leave the M2.1 summary unchanged", () => {
  const plan = syntheticPlan();
  const legacy = contextFor(plan);
  const extended: AgentContextSnapshot = {
    ...legacy,
    currentPlan: createSafeCurrentPlanSnapshot({ plan, layout, includeRoomDetails: true }),
    observedSchedule: {
      source: { type: "skland_schedule" }, sampledAt: "2026-09-01T00:00:00.000Z",
      rooms: [{ kind: "trade_post", index: 0, operators: ["合成观测干员"] }],
    },
  };
  assert.equal(extended.schemaVersion, 1);
  assert.equal(legacy.currentPlan && "rooms" in legacy.currentPlan, false);
  assert.ok(extended.currentPlan?.rooms?.length);
  assert.deepEqual(
    executeCurrentPlanSummary({}, { snapshot: extended }),
    executeCurrentPlanSummary({}, { snapshot: legacy }),
  );
  assert.equal(JSON.stringify(executeCurrentPlanSummary({}, { snapshot: extended })).includes("合成观测干员"), false);
});
