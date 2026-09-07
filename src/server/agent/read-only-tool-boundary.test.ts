import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CURRENT_PLAN_SUMMARY_TOOL, executeCurrentPlanSummary } from "./tools/current-plan-summary.ts";
import { CURRENT_PLAN_ROOM_DETAIL_TOOL, executeCurrentPlanRoomDetail } from "./tools/current-plan-room-detail.ts";
import { SAVED_PLAN_LIST_TOOL } from "./tools/saved-plan-list.ts";
import { SAVED_PLAN_COMPARE_TOOL } from "./tools/saved-plan-compare.ts";
import { createSafeCurrentPlanSnapshot } from "./context-contract.ts";
import { syntheticSavedPlan } from "./saved-plan-test-fixtures.ts";

test("exactly four approved tools are read-only and exclude identity/context from model arguments", async () => {
  const definitions = [CURRENT_PLAN_SUMMARY_TOOL, CURRENT_PLAN_ROOM_DETAIL_TOOL, SAVED_PLAN_LIST_TOOL, SAVED_PLAN_COMPARE_TOOL];
  assert.deepEqual(definitions.map((tool) => tool.name), ["current_plan.get_summary", "current_plan.get_room_detail", "saved_plan.list", "saved_plan.compare"]);
  for (const tool of definitions) {
    assert.equal(tool.effect, "read"); assert.equal(tool.inputSchema.additionalProperties, false);
    for (const key of ["userId", "actor", "permissions", "currentPlan", "observedSchedule", "includeObserved"]) {
      assert.equal(Object.hasOwn(tool.inputSchema.properties, key), false);
    }
  }
  for (const file of ["current-plan-summary", "current-plan-room-detail", "saved-plan-list", "saved-plan-compare"]) {
    const source = await readFile(new URL(`./tools/${file}.ts`, import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.ok(imports.every((path) => !/drizzle|\/db(?:\/|\.)|workspace|openai|infra-cli/.test(path)));
    assert.equal(/fetch\(|localStorage|process\.env/.test(source), false);
  }
});

test("new upstream drone/fallback fields do not change current-plan tools or expand their whitelist", () => {
  const row = syntheticSavedPlan("current");
  const execute = () => {
    const snapshot = { schemaVersion: 1, contextRevision: "synthetic-context-revision", sampledAt: "2026-09-07T00:00:00.000Z", activeShift: 0,
      currentPlan: createSafeCurrentPlanSnapshot({ plan: row.publicResult, layout: row.calculationContext.layout, includeRoomDetails: true }) };
    return [executeCurrentPlanSummary({}, { snapshot }), executeCurrentPlanRoomDetail({ roomRef: "trade_1", shiftIndex: null }, { snapshot })];
  };
  const before = execute();
  row.publicResult.rotation.daily.drone_production = { lmd: 100000, pure_gold: 200000, battle_records: 300000 };
  for (const plan of row.publicResult.maa.plans) plan.drones = { enable: true, room: "trading", index: 1, order: "post" };
  Object.assign(row.publicResult, { fallbackUsed: true, solverAttempts: ["synthetic-private"] });
  assert.deepEqual(execute(), before);
});
