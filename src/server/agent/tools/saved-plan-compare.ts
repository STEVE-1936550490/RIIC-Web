import { AGENT_PRODUCTION_METRICS, AGENT_ROOM_EFFICIENCY_FIELDS, type SafeRoomShift } from "../context-contract.ts";
import { parseSavedPlanActor, parseSavedPlanMetadata, savedPlanId, savedPlanRecord, SavedPlanReadError, type SavedPlanMetadata } from "../../saved-plan-read-service.ts";
import { parseSavedPlanComparisonProjection, type ComparisonRoom, type SavedPlanComparisonProjection } from "../../saved-plan-comparison-projection.ts";
import type { SavedPlanComparisonReadService } from "../../saved-plan-comparison-service.ts";
import { SavedPlanToolInputError } from "./saved-plan-list.ts";

export const MAX_COMPARISON_ROOMS = 16;
export const MAX_COMPARISON_PERSON_CHANGES = 40;
export const MAX_COMPARISON_TRAINING = 12;
export const MAX_COMPARISON_LIMITATIONS = 12;
export const MAX_COMPARISON_BYTES = 16 * 1024;
export const SAVED_PLAN_COMPARE_TOOL = {
  name: "saved_plan.compare", effect: "read",
  inputSchema: { type: "object", properties: {
    leftPlanId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" },
    rightPlanId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" },
  }, required: ["leftPlanId", "rightPlanId"], additionalProperties: false },
} as const;

export function parseSavedPlanCompareInput(value: unknown): { leftPlanId: string; rightPlanId: string } {
  try {
    const input = savedPlanRecord(value);
    if (Object.keys(input).length !== 2 || !Object.hasOwn(input, "leftPlanId") || !Object.hasOwn(input, "rightPlanId")) throw new Error();
    return { leftPlanId: savedPlanId(input.leftPlanId), rightPlanId: savedPlanId(input.rightPlanId) };
  } catch { throw new SavedPlanToolInputError(); }
}

type NotComparableReason = "MISSING_LEFT_VALUE" | "MISSING_RIGHT_VALUE" | "MISSING_BOTH_VALUES"
  | "SOURCE_BASIS_MISMATCH" | "CONTEXT_INCOMPATIBLE" | "ROOM_KIND_CHANGED" | "PRODUCT_CHANGED"
  | "SHIFT_STRUCTURE_CHANGED" | "OCCUPANCY_UNAVAILABLE";
type NumericDiff = { status: "comparable"; left: number; right: number; delta: number }
  | { status: "not_comparable"; reason: NotComparableReason };
type ValueChange<T> = { left: T; right: T };
type PersonDiff = { status: "comparable"; added: string[]; removed: string[] }
  | { status: "not_comparable"; reason: "OCCUPANCY_UNAVAILABLE" };
type RoomShiftDiff = {
  shiftIndex: number;
  product: ValueChange<string | null> | null;
  operators: PersonDiff;
  efficiency: Array<{ metric: string; comparison: NumericDiff }>;
};
type RoomDiff = {
  roomId: string; label: string; status: "added" | "removed" | "changed" | "not_comparable";
  kind: ValueChange<ComparisonRoom["kind"] | null>;
  level: ValueChange<number | null>;
  configuredProduct: ValueChange<string | null>;
  shifts: RoomShiftDiff[];
};
type ComparisonData = {
  left: SavedPlanMetadata; right: SavedPlanMetadata;
  samePlan: boolean;
  hasKnownDifferences: boolean;
  rooms: RoomDiff[];
  shifts: { count: NumericDiff; changes: Array<{ index: number; status: "added" | "removed" | "changed" | "not_comparable";
    durationHours: NumericDiff; periodsChanged: boolean; structureChanged: boolean }> };
  training: { status: "comparable"; changes: Array<{ shiftIndex: number; position: "trainee" | "trainer"; left: string | null; right: string | null }> }
    | { status: "not_comparable"; reason: "TRAINING_DATA_UNAVAILABLE" };
  production: { source: "solver_natural_24h"; metrics: Array<{ metric: string; unit: string; comparison: NumericDiff }> };
  limitations: string[];
};
type CompareBase = { source: { type: "saved_plans" }; truncation: { applied: boolean; omittedCount: number } };
export type SavedPlanCompareResult = CompareBase & (
  | { status: "ok"; data: ComparisonData }
  | { status: "missing"; issue: { code: "PLAN_NOT_FOUND_OR_FORBIDDEN" } }
  | { status: "unavailable"; issue: { code: SavedPlanReadError["code"] } }
);

function numeric(left: number | null, right: number | null, reason?: NotComparableReason): NumericDiff {
  if (left === null && right === null) return { status: "not_comparable", reason: "MISSING_BOTH_VALUES" };
  if (left === null) return { status: "not_comparable", reason: "MISSING_LEFT_VALUE" };
  if (right === null) return { status: "not_comparable", reason: "MISSING_RIGHT_VALUE" };
  return reason ? { status: "not_comparable", reason } : { status: "comparable", left, right, delta: right - left };
}

function people(left: string[] | null, right: string[] | null): PersonDiff {
  if (left === null || right === null) return { status: "not_comparable", reason: "OCCUPANCY_UNAVAILABLE" };
  const a = new Set(left); const b = new Set(right);
  return { status: "comparable", added: [...b].filter((name) => !a.has(name)).sort(), removed: [...a].filter((name) => !b.has(name)).sort() };
}

function changedPeople(diff: PersonDiff) { return diff.status === "comparable" && (diff.added.length > 0 || diff.removed.length > 0); }
function differentPeriods(left: string[] | null, right: string[] | null) { return JSON.stringify(left) !== JSON.stringify(right); }

function compareProjections(left: SavedPlanComparisonProjection, right: SavedPlanComparisonProjection,
  leftMetadata: SavedPlanMetadata, rightMetadata: SavedPlanMetadata): ComparisonData {
  const contextReason: NotComparableReason | undefined = !left.basis.contextCompatible || !right.basis.contextCompatible || left.basis.contextKey !== right.basis.contextKey ? "CONTEXT_INCOMPATIBLE"
    : left.basis.schemaVersion === null || right.basis.schemaVersion === null || left.basis.schemaVersion !== right.basis.schemaVersion ? "SOURCE_BASIS_MISMATCH" : undefined;
  const limitations = new Set<string>(["DIFFS_USE_ZERO_BASED_SHIFT_POSITIONS", "DAILY_PRODUCTION_EXCLUDES_DRONES_NO_ESTIMATION", "NO_OVERALL_PLAN_QUALITY_RANKING", "PERSONNEL_SETS_IGNORE_SKILL_SELECTION"]);
  if (contextReason) limitations.add(contextReason);
  const a = new Map(left.rooms.map((room) => [room.roomId, room]));
  const b = new Map(right.rooms.map((room) => [room.roomId, room]));
  const roomIds = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => {
    const rank = (id: string) => a.get(id)?.layoutOrder ?? 64 + (b.get(id)?.layoutOrder ?? 0);
    return rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0);
  });
  const rooms: RoomDiff[] = [];
  let hasKnownDifferences = false;
  for (const roomId of roomIds) {
    const l = a.get(roomId); const r = b.get(roomId);
    const selected = l ?? r;
    if (!selected) continue;
    const shifts: RoomShiftDiff[] = [];
    let changed = !l || !r || l.kind !== r.kind || l.level !== r.level || l.configuredProduct !== r.configuredProduct;
    for (let i = 0; i < Math.max(l?.shifts.length ?? 0, r?.shifts.length ?? 0); i++) {
      const ls: SafeRoomShift | undefined = l?.shifts[i]; const rs = r?.shifts[i];
      const operators = people(ls ? ls.operators : [], rs ? rs.operators : []);
      const productChanged = (ls?.product ?? null) !== (rs?.product ?? null);
      const durationChanged = !left.shifts[i] || !right.shifts[i] || left.shifts[i].durationHours === null
        || right.shifts[i].durationHours === null || left.shifts[i].durationHours !== right.shifts[i].durationHours
        || left.shifts[i].structureKey === null || right.shifts[i].structureKey === null || left.shifts[i].structureKey !== right.shifts[i].structureKey
        || differentPeriods(left.shifts[i].periods, right.shifts[i].periods);
      const reason = contextReason ?? (l?.kind !== r?.kind ? "ROOM_KIND_CHANGED" : productChanged ? "PRODUCT_CHANGED"
        : durationChanged ? "SHIFT_STRUCTURE_CHANGED" : undefined);
      const efficiency = AGENT_ROOM_EFFICIENCY_FIELDS.filter((metric) => ls?.efficiency?.[metric] !== undefined || rs?.efficiency?.[metric] !== undefined)
        .map((metric) => ({ metric, comparison: numeric(ls?.efficiency?.[metric] ?? null, rs?.efficiency?.[metric] ?? null, reason) }));
      if (!efficiency.length) limitations.add("EFFICIENCY_DATA_UNAVAILABLE");
      if (operators.status === "not_comparable") limitations.add("OCCUPANCY_UNAVAILABLE");
      const efficiencyChanged = efficiency.some((item) => item.comparison.status === "comparable" && item.comparison.delta !== 0);
      const unknown = efficiency.some((item) => item.comparison.status === "not_comparable") || operators.status === "not_comparable";
      if (productChanged || changedPeople(operators) || efficiencyChanged) changed = true;
      if (productChanged || changedPeople(operators) || efficiencyChanged || unknown) shifts.push({ shiftIndex: i,
        product: productChanged ? { left: ls?.product ?? null, right: rs?.product ?? null } : null, operators, efficiency });
    }
    if (changed) hasKnownDifferences = true;
    if (changed || shifts.length) rooms.push({ roomId, label: selected.label, status: !l ? "added" : !r ? "removed" : changed ? "changed" : "not_comparable",
      kind: { left: l?.kind ?? null, right: r?.kind ?? null }, level: { left: l?.level ?? null, right: r?.level ?? null },
      configuredProduct: { left: l?.configuredProduct ?? null, right: r?.configuredProduct ?? null }, shifts });
  }
  const shiftChanges: ComparisonData["shifts"]["changes"] = [];
  for (let i = 0; i < Math.max(left.shifts.length, right.shifts.length); i++) {
    const l = left.shifts[i]; const r = right.shifts[i];
    const periodsChanged = differentPeriods(l?.periods ?? null, r?.periods ?? null);
    const structureChanged = Boolean(l?.structureKey && r?.structureKey && l.structureKey !== r.structureKey);
    if (!l || !r || l.durationHours !== r.durationHours || periodsChanged || structureChanged) {
      const knownChange = !l || !r || (l.durationHours !== null && r.durationHours !== null && l.durationHours !== r.durationHours) || periodsChanged || structureChanged;
      shiftChanges.push({ index: i, status: !l ? "added" : !r ? "removed" : knownChange ? "changed" : "not_comparable",
        durationHours: numeric(l?.durationHours ?? null, r?.durationHours ?? null), periodsChanged, structureChanged });
      if (knownChange) hasKnownDifferences = true;
    }
    if (l?.durationHours === null || r?.durationHours === null) limitations.add("SHIFT_DURATION_UNAVAILABLE");
    if (l?.structureKey === null || r?.structureKey === null) limitations.add("SHIFT_STRUCTURE_UNAVAILABLE");
  }
  let training: ComparisonData["training"] = { status: "not_comparable", reason: "TRAINING_DATA_UNAVAILABLE" };
  if (left.training && right.training) {
    const changes: Extract<ComparisonData["training"], { status: "comparable" }>["changes"] = [];
    for (let i = 0; i < Math.max(left.training.length, right.training.length); i++) {
      for (const position of ["trainee", "trainer"] as const) {
        const l = left.training[i]?.[position] ?? null; const r = right.training[i]?.[position] ?? null;
        if (l !== r) changes.push({ shiftIndex: i, position, left: l, right: r });
      }
    }
    if (changes.length) hasKnownDifferences = true;
    training = { status: "comparable", changes };
  } else limitations.add("TRAINING_DATA_UNAVAILABLE");
  const units = { lmd: "LMD/day", pureGold: "gold_units/day", experience: "EXP/day", originiumShards: "shards/day", orundum: "orundum/day" };
  const metrics = AGENT_PRODUCTION_METRICS.map((metric) => ({ metric, unit: units[metric], comparison: numeric(left.daily[metric], right.daily[metric], contextReason) }));
  if (metrics.some((item) => item.comparison.status === "comparable" && item.comparison.delta !== 0)) hasKnownDifferences = true;
  return { left: leftMetadata, right: rightMetadata, samePlan: leftMetadata.id === rightMetadata.id, hasKnownDifferences, rooms,
    shifts: { count: numeric(left.shifts.length, right.shifts.length), changes: shiftChanges }, training,
    production: { source: "solver_natural_24h", metrics }, limitations: [...limitations].sort() };
}

/** Count omitted array entries, including nested entries when their parent is omitted. */
function arrayEntries(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.length + value.reduce((sum, item) => sum + arrayEntries(item), 0);
  return Object.values(value).reduce<number>((sum, item) => sum + arrayEntries(item), 0);
}

function truncate(result: Extract<SavedPlanCompareResult, { status: "ok" }>): SavedPlanCompareResult {
  const before = arrayEntries(result.data);
  const data = result.data;
  data.rooms = data.rooms.slice(0, MAX_COMPARISON_ROOMS);
  let remainingPeople = MAX_COMPARISON_PERSON_CHANGES;
  for (const room of data.rooms) for (const shift of room.shifts) if (shift.operators.status === "comparable") {
    for (const key of ["added", "removed"] as const) {
      shift.operators[key] = shift.operators[key].slice(0, remainingPeople);
      remainingPeople -= shift.operators[key].length;
    }
  }
  if (data.training.status === "comparable") data.training.changes = data.training.changes.slice(0, MAX_COMPARISON_TRAINING);
  data.limitations = data.limitations.slice(0, MAX_COMPARISON_LIMITATIONS);
  const update = () => { result.truncation.omittedCount = before - arrayEntries(data); result.truncation.applied = result.truncation.omittedCount > 0; };
  update();
  while (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_COMPARISON_BYTES) {
    if (data.rooms.length) data.rooms.pop();
    else if (data.training.status === "comparable" && data.training.changes.length) data.training.changes.pop();
    else if (data.shifts.changes.length) data.shifts.changes.pop();
    else throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
    update();
  }
  return result;
}

export async function executeSavedPlanCompare(input: unknown, context: { actor: unknown; service: SavedPlanComparisonReadService }): Promise<SavedPlanCompareResult> {
  const args = parseSavedPlanCompareInput(input);
  const base: CompareBase = { source: { type: "saved_plans" }, truncation: { applied: false, omittedCount: 0 } };
  try {
    const actor = parseSavedPlanActor(context.actor);
    const response: unknown = await context.service.readPair(actor, args.leftPlanId, args.rightPlanId);
    const pair = savedPlanRecord(response);
    if (pair.status === "missing") return { ...base, status: "missing", issue: { code: "PLAN_NOT_FOUND_OR_FORBIDDEN" } };
    if (pair.status !== "available") throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
    const l = savedPlanRecord(pair.left); const r = savedPlanRecord(pair.right);
    const leftMetadata = parseSavedPlanMetadata(l.metadata); const rightMetadata = parseSavedPlanMetadata(r.metadata);
    if (leftMetadata.id !== args.leftPlanId || rightMetadata.id !== args.rightPlanId) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
    const left = parseSavedPlanComparisonProjection(l.projection); const right = parseSavedPlanComparisonProjection(r.projection);
    return truncate({ ...base, status: "ok", data: compareProjections(left, right, leftMetadata, rightMetadata) });
  } catch (error) {
    return { ...base, status: "unavailable", issue: { code: error instanceof SavedPlanReadError ? error.code : "SAVED_PLAN_DATA_UNAVAILABLE" } };
  }
}
