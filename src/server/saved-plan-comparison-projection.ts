import { createHash } from "node:crypto";
import type { MaaPlan, MaaRoom, MaaRooms, RotationShift, TrainingRoomShift } from "../types.ts";
import { validateSavedPlanCalculationContext } from "./workspace-payload.ts";
import {
  AGENT_ROOM_EFFICIENCY_FIELDS, AGENT_PRODUCTION_METRICS, MAX_AGENT_CONTEXT_SHIFTS,
  parsePlanRooms, projectPlanRooms, type SafeCurrentPlanRoom, type AgentProductionMetric,
} from "./agent/context-contract.ts";
import { savedPlanRecord, savedPlanText, SavedPlanReadError } from "./saved-plan-read-service.ts";

export type ComparisonRoom = SafeCurrentPlanRoom & { configuredProduct: string | null };
export type ComparisonShift = { durationHours: number | null; periods: string[] | null; structureKey: string | null };
/** Internal bounded read DTO, not an AgentContextSnapshot or a tool result. */
export type SavedPlanComparisonProjection = {
  rooms: ComparisonRoom[];
  shifts: ComparisonShift[];
  training: TrainingRoomShift[] | null;
  daily: Record<AgentProductionMetric, number | null>;
  basis: { schemaVersion: number | null; contextKey: string; contextCompatible: boolean; source: "solver_natural_24h" };
};

function unavailable(): never { throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE"); }
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return unavailable();
  return Array.from(value);
}
function numberOrNull(value: unknown, minimum = 0, maximum = 1e12): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}
function textOrNull(value: unknown): string | null { return value === null ? null : savedPlanText(value, 128).trim(); }
function parseTraining(value: unknown, count: number): TrainingRoomShift[] | null {
  if (value === null || value === undefined) return null;
  const shifts = array(value, MAX_AGENT_CONTEXT_SHIFTS);
  if (shifts.length !== count) return unavailable();
  return shifts.map((item) => {
    const shift = savedPlanRecord(item);
    return { trainee: textOrNull(shift.trainee), trainer: textOrNull(shift.trainer) };
  });
}

const GROUPS = ["control", "trading", "manufacture", "power", "dormitory", "hire", "processing", "meeting"] as const;
function projectMaaRoom(value: unknown): MaaRoom {
  const raw = savedPlanRecord(value);
  let unknownOccupancy = !Array.isArray(raw.operators);
  const operators = unknownOccupancy ? [] : array(raw.operators, 64).map((slot) => {
    if (slot === null) return null;
    if (typeof slot === "string") return savedPlanText(slot, 128).trim();
    const object = savedPlanRecord(slot);
    if (typeof object.name !== "string" || !object.name.trim()) { unknownOccupancy = true; return null; }
    const name = savedPlanText(object.name, 128).trim();
    if (object.skill === undefined) return { name };
    const skill = numberOrNull(object.skill, 0, 3);
    if (skill === null || !Number.isInteger(skill)) return unavailable();
    // Compare personnel sets by display name, not the optional selected skill suffix.
    return { name };
  });
  for (const key of ["skip", "autofill", "use_operator_groups"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") return unavailable();
  }
  return {
    operators, skip: unknownOccupancy || raw.skip === true, autofill: raw.autofill === true,
    use_operator_groups: raw.use_operator_groups === true,
    ...(raw.product === undefined ? {} : { product: savedPlanText(raw.product, 128) }),
  };
}

function periods(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  return array(value, 24).map((item) => {
    const pair = array(item, 2);
    if (pair.length !== 2) return unavailable();
    const times = pair.map((value) => savedPlanText(value, 5));
    if (times.some((time) => !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))) return unavailable();
    return times.join("-");
  }).sort();
}

function shiftStructure(shift: Record<string, unknown>): string | null {
  if (!Array.isArray(shift.active_teams) || typeof shift.resting_team !== "string") return null;
  const active = array(shift.active_teams, 64).map((item) => savedPlanText(item, 80)).sort();
  if (shift.resting_team.length > 80) return unavailable();
  // Detect changed team structure without retaining or returning internal team references.
  return createHash("sha256").update(JSON.stringify([active, shift.resting_team])).digest("hex");
}

/** Reads only actual persisted values. No normalizeRotationResult fallback, estimator, or solver. */
export function projectSavedPlanComparison(resultInput: unknown, contextInput: unknown): SavedPlanComparisonProjection {
  const context = validateSavedPlanCalculationContext(contextInput);
  if (!context) return unavailable();
  const raw = savedPlanRecord(resultInput);
  const profile = savedPlanRecord(raw.profile);
  const rotation = savedPlanRecord(raw.rotation);
  const maa = savedPlanRecord(raw.maa);
  const rawPlans = array(maa.plans, MAX_AGENT_CONTEXT_SHIFTS);
  const rawShifts = array(rotation.shifts, MAX_AGENT_CONTEXT_SHIFTS);
  if (rawPlans.length !== rawShifts.length) return unavailable();
  const plans: MaaPlan[] = rawPlans.map((value) => {
    const rawPlan = savedPlanRecord(value);
    const rawRooms = savedPlanRecord(rawPlan.rooms);
    const rooms: MaaRooms = {};
    for (const group of GROUPS) {
      if (rawRooms[group] !== undefined) rooms[group] = array(rawRooms[group], 64).map(projectMaaRoom);
    }
    return { name: "safe room mapping", rooms };
  });
  const shifts: ComparisonShift[] = rawShifts.map((value, i) => {
    const shift = savedPlanRecord(value);
    return { durationHours: numberOrNull(shift.duration_hours, Number.MIN_VALUE, 168), periods: periods(savedPlanRecord(rawPlans[i]).period), structureKey: shiftStructure(shift) };
  });
  const rotationShifts: RotationShift[] = rawShifts.map((value, i) => {
    const shift = savedPlanRecord(value);
    const scores = shift.scores === undefined ? {} : savedPlanRecord(shift.scores);
    const roomLines = scores.room_lines === undefined ? [] : array(scores.room_lines, 64).map((value) => {
      const line = savedPlanRecord(value);
      const output: RotationShift["scores"]["room_lines"][number] = { room_id: savedPlanText(line.room_id, 80) };
      for (const field of AGENT_ROOM_EFFICIENCY_FIELDS) {
        if (line[field] !== undefined) {
          const number = numberOrNull(line[field], -1e12);
          if (number !== null) output[field] = number;
        }
      }
      return output;
    });
    // Only room_lines are consumed by the room mapper. Aggregate placeholders are never exposed.
    return { index: i, duration_hours: shifts[i].durationHours ?? 0, active_teams: [], resting_team: "",
      scores: { room_lines: roomLines, trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0 }, weighted_trade: 0, weighted_manu: 0, weighted_power: 0 };
  });
  const rawTraining = raw.trainingRoom === undefined ? null : savedPlanRecord(raw.trainingRoom);
  if (rawTraining && rawTraining.schema_version !== 1) return unavailable();
  const training = parseTraining(rawTraining?.shifts, shifts.length);
  const mapped = projectPlanRooms({
    maa: { title: "safe room mapping", plans },
    rotation: { profile: context.rotationProfile, shifts: rotationShifts, daily: { trade: null, manufacture: null, power: null } },
    ...(training ? { trainingRoom: { schema_version: 1, shifts: training } } : {}),
  }, context.layout, shifts.length);
  const rooms = mapped.map((room) => {
    const product = context.layout.rooms.find((item) => item.id === room.roomId)?.product;
    return { ...room, configuredProduct: product ? "trade" in product ? `trade:${product.trade.order}` : `factory:${product.factory.recipe}` : null };
  });
  const daily = rotation.daily === undefined ? {} : savedPlanRecord(rotation.daily);
  const production = daily.production === undefined ? {} : savedPlanRecord(daily.production);
  const pureGold = numberOrNull(production.pure_gold);
  const scenario = context.layout.scenario;
  const schemaVersion = numberOrNull(profile.schema_version, 1, 1000);
  return parseSavedPlanComparisonProjection({
    rooms, shifts, training,
    daily: { lmd: numberOrNull(production.lmd), pureGold: pureGold === null ? null : pureGold / 500,
      experience: numberOrNull(production.battle_records), originiumShards: numberOrNull(production.originium_shards), orundum: numberOrNull(production.orundum) },
    basis: { source: "solver_natural_24h", schemaVersion: schemaVersion !== null && Number.isInteger(schemaVersion) ? schemaVersion : null,
      contextCompatible: rotation.profile === context.rotationProfile && profile.rotation_profile === context.rotationProfile,
      contextKey: JSON.stringify([context.rotationProfile, typeof rotation.profile === "string" ? rotation.profile : null,
        context.fiammettaEnabled, scenario.elite_facility_count ?? null, scenario.sui_facility_count ?? null,
        scenario.dorm_occupant_count ?? null, scenario.initial_global?.monster_cuisine ?? null]) },
  });
}

/** Validate the injected service DTO again; never accept a raw persisted object as a tool parameter. */
export function parseSavedPlanComparisonProjection(value: unknown): SavedPlanComparisonProjection {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) return unavailable();
  const raw = savedPlanRecord(value);
  const shifts = array(raw.shifts, MAX_AGENT_CONTEXT_SHIFTS).map((value): ComparisonShift => {
    const shift = savedPlanRecord(value);
    if (shift.durationHours !== null && numberOrNull(shift.durationHours, Number.MIN_VALUE, 168) === null) return unavailable();
    if (shift.structureKey !== null && (typeof shift.structureKey !== "string" || !/^[a-f0-9]{64}$/.test(shift.structureKey))) return unavailable();
    return { durationHours: numberOrNull(shift.durationHours), structureKey: shift.structureKey, periods: shift.periods === null ? null
      : array(shift.periods, 24).map((value) => savedPlanText(value, 11)).sort() };
  });
  const rooms = array(raw.rooms, 64).map((value) => {
    const room = savedPlanRecord(value);
    const [parsed] = parsePlanRooms([{ roomId: room.roomId, label: room.label, kind: room.kind,
      index: room.index, layoutOrder: room.layoutOrder, level: room.level, shifts: room.shifts }]);
    if (parsed.shifts.length !== shifts.length) return unavailable();
    return { ...parsed, configuredProduct: room.configuredProduct === null ? null : savedPlanText(room.configuredProduct, 40) };
  });
  if (new Set(rooms.map((room) => room.roomId)).size !== rooms.length || new Set(rooms.map((room) => room.layoutOrder)).size !== rooms.length) return unavailable();
  const rawDaily = savedPlanRecord(raw.daily);
  const daily: SavedPlanComparisonProjection["daily"] = { lmd: null, pureGold: null, experience: null, originiumShards: null, orundum: null };
  for (const metric of AGENT_PRODUCTION_METRICS) {
    if (rawDaily[metric] !== null && numberOrNull(rawDaily[metric]) === null) return unavailable();
    daily[metric] = numberOrNull(rawDaily[metric]);
  }
  const basis = savedPlanRecord(raw.basis);
  if (basis.source !== "solver_natural_24h" || typeof basis.contextCompatible !== "boolean" || basis.schemaVersion !== null
    && (numberOrNull(basis.schemaVersion, 1, 1000) === null || !Number.isInteger(basis.schemaVersion))) return unavailable();
  return { rooms, shifts, daily, training: parseTraining(raw.training, shifts.length),
    basis: { source: "solver_natural_24h", schemaVersion: numberOrNull(basis.schemaVersion), contextKey: savedPlanText(basis.contextKey, 256), contextCompatible: basis.contextCompatible } };
}
