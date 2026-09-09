// Public synthetic demonstration data only. Never a real user's Workspace or Box.
import type { PublicPlanData, SavedPlanCalculationContext } from "../../types.ts";
import { createSafeCurrentPlanSnapshot } from "./context-contract.ts";
export const PREVIEW_EXAMPLE_REVISION = "m4-synthetic-v1";
export function previewExample(): { calculationContext: SavedPlanCalculationContext; publicResult: PublicPlanData } {
  return {
    calculationContext: { presetLabel: "合成布局", rotationProfile: "main_backup_12_12", fiammettaEnabled: false,
      layout: { template: "synthetic", drone_cap: 200, scenario: {}, rooms: [
        { id: "control", kind: "control_center", level: 5 },
        { id: "trade_1", kind: "trade_post", level: 3, product: { trade: { order: "gold" } } },
        { id: "manu_1", kind: "factory", level: 3, product: { factory: { recipe: "gold" } } },
        { id: "power_1", kind: "power_plant", level: 3 },
        { id: "training_room", kind: "training_room", level: 3 },
      ] } },
    publicResult: {
      diagnosticId: "m4-synthetic-base", durationMs: 12345,
      profile: { schema_version: 4, rotation_profile: "main_backup_12_12", layout_label: "合成布局", operbox_label: "合成",
        baseline_label: "合成", summary: { owned: 4, tier_up_owned: 0, trade_pool_ready: 0 }, domains: [], rotation: {},
        baseline_rotation: {}, actions: [], flags: [], narration_hints: [] },
      maa: { title: "合成", plans: [0, 1].map((i) => ({ name: `合成 ${i}`, rooms: {
        control: [{ operators: ["中枢甲"] }], trading: [{ operators: ["贸易甲"], product: "LMD" }],
        manufacture: [{ operators: ["制造甲"], product: "Pure Gold" }], power: [{ operators: ["发电甲"] }],
      } })) },
      rotation: { profile: "main_backup_12_12", shifts: [0, 1].map((i) => ({
        index: i, duration_hours: 12, active_teams: ["synthetic-team"], resting_team: "synthetic-rest",
        scores: { trade_score: 1, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [{ room_id: "trade_1", final_efficiency: 1.2 }] },
        weighted_trade: 1, weighted_manu: 0, weighted_power: 0,
      })), daily: { trade: 1, manufacture: 0, power: 0,
        production: { lmd: 100, pure_gold: 1000, battle_records: 200, originium_shards: 0, orundum: 0 } } },
      trainingRoom: { schema_version: 1, shifts: [{ trainee: null, trainer: null }, { trainee: null, trainer: null }] },
    },
  };
}
export function previewExampleSnapshot() {
  const example = previewExample();
  return createSafeCurrentPlanSnapshot({ plan: example.publicResult, layout: example.calculationContext.layout, includeRoomDetails: true });
}
