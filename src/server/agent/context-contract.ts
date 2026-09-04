import {
  estimateDailyProduction,
  type DailyProductionEstimate,
  type DailyProductionUnavailableReason,
} from "../../daily-production.ts";
import { MAX_MANUAL_SHIFT_COUNT } from "../../manual-schedule-config.ts";
import { planToRows } from "../../schedule.ts";
import type {
  BaseBlueprint,
  PublicPlanData,
  RoomKind,
  RotationProfile,
} from "../../types.ts";

export const AGENT_CONTEXT_SCHEMA_VERSION = 1 as const;
export const MAX_AGENT_CONTEXT_BYTES = 32 * 1024;
export const MAX_AGENT_CONTEXT_REVISION_LENGTH = 80;
export const MAX_AGENT_DIAGNOSTIC_ID_LENGTH = 80;
export const MAX_AGENT_LAYOUT_LABEL_LENGTH = 120;
export const MAX_AGENT_CONTEXT_SHIFTS = MAX_MANUAL_SHIFT_COUNT;
export const MAX_AGENT_CONTEXT_ROOMS = 64;
export const MAX_AGENT_PLANNED_SLOTS = MAX_AGENT_CONTEXT_ROOMS * 5;
export const MAX_AGENT_SHIFT_DURATION_HOURS = 168;
export const MAX_AGENT_OWNED_OPERATOR_COUNT = 1_000;

export const AGENT_ROOM_KINDS = [
  "control_center",
  "trade_post",
  "factory",
  "power_plant",
  "dormitory",
  "office",
  "meeting_room",
  "workshop",
  "training_room",
] as const satisfies readonly RoomKind[];

export const AGENT_PRODUCTION_METRICS = [
  "lmd",
  "pureGold",
  "experience",
  "originiumShards",
  "orundum",
] as const;

export type AgentProductionMetric = (typeof AGENT_PRODUCTION_METRICS)[number];

export type SafeCurrentPlanProfile = {
  layoutLabel: string;
  rotationProfile: RotationProfile;
  ownedOperatorCount: number;
};

export type SafeCurrentPlanRoomCount = {
  kind: RoomKind;
  count: number;
};

export type SafeCurrentPlanShift = {
  durationHours: number;
  plannedRoomCount: number;
  plannedOccupiedSlots: number;
};

export type SafeCurrentPlanTraining = {
  shifts: Array<{
    traineeAssigned: boolean;
    trainerAssigned: boolean;
  }>;
};

export type SafeCurrentPlanProductionValues = {
  lmd: number | null;
  pureGold: number | null;
  experience: number | null;
  originiumShards: number | null;
  orundum: number | null;
};

export type SafeCurrentPlanSolverProductionValues = {
  lmd: number;
  pureGold: number;
  experience: number;
  originiumShards: number;
  orundum: number;
};

export type SafeCurrentPlanProductionUnavailable = {
  metric: AgentProductionMetric;
  reason: DailyProductionUnavailableReason;
};

export type SafeCurrentPlanProduction =
  | {
      source: "solver";
      values: SafeCurrentPlanSolverProductionValues;
    }
  | {
      source: "estimate";
      values: SafeCurrentPlanProductionValues;
      unavailable: SafeCurrentPlanProductionUnavailable[];
    }
  | {
      source: "unavailable";
      reason: "MISSING_SHIFT_DATA" | "MISMATCHED_SHIFT_DATA" | "ESTIMATE_INPUT_INCOMPLETE";
      unavailable: SafeCurrentPlanProductionUnavailable[];
    };

export type SafeCurrentPlanSnapshot = {
  diagnosticId: string;
  profile: SafeCurrentPlanProfile;
  roomCounts: SafeCurrentPlanRoomCount[];
  shifts: SafeCurrentPlanShift[];
  production: SafeCurrentPlanProduction;
  training: SafeCurrentPlanTraining | null;
};

export type AgentContextSnapshot = {
  schemaVersion: 1;
  contextRevision: string;
  sampledAt: string;
  activeShift: number;
  currentPlan: SafeCurrentPlanSnapshot | null;
};

export type AgentContextErrorCode =
  | "AGENT_CONTEXT_INVALID_SHAPE"
  | "AGENT_CONTEXT_CONTRACT_VIOLATION";

export class AgentContextShapeError extends Error {
  readonly code = "AGENT_CONTEXT_INVALID_SHAPE" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentContextShapeError";
  }
}

export class AgentContextContractError extends Error {
  readonly code = "AGENT_CONTEXT_CONTRACT_VIOLATION" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentContextContractError";
  }
}

function shapeError(message: string): never {
  throw new AgentContextShapeError(message);
}

function contractError(message: string): never {
  throw new AgentContextContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(
  value: unknown,
  path: string,
  requiredKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) return shapeError(`${path} 必须是对象。`);
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) return shapeError(`${path} 缺少字段 ${key}。`);
  }
  const additionalKey = Object.keys(value).find((key) => !requiredKeys.includes(key));
  if (additionalKey) return shapeError(`${path} 不允许额外字段 ${additionalKey}。`);
  return value;
}

function parseBoundedString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return shapeError(`${path} 必须是非空字符串。`);
  }
  if ([...value].length > maxLength) {
    return shapeError(`${path} 不能超过 ${maxLength} 个字符。`);
  }
  return value;
}

function parseInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    return shapeError(`${path} 必须是 ${minimum}–${maximum} 的整数。`);
  }
  return Number(value);
}

function parseFiniteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    return shapeError(`${path} 必须是 ${minimum}–${maximum} 的有限数值。`);
  }
  return value;
}

function parseNullableProductionNumber(value: unknown, path: string): number | null {
  return value === null ? null : parseFiniteNumber(value, path, 0, 1_000_000_000_000);
}

function parseContextRevision(value: unknown): string {
  const revision = parseBoundedString(
    value,
    "AgentContextSnapshot.contextRevision",
    MAX_AGENT_CONTEXT_REVISION_LENGTH,
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(revision)) {
    return shapeError("AgentContextSnapshot.contextRevision 格式无效。");
  }
  return revision;
}

function parseSampledAt(value: unknown): string {
  if (typeof value !== "string" || value.length > 40) {
    return shapeError("AgentContextSnapshot.sampledAt 必须是有效 ISO 时间字符串。");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    return shapeError("AgentContextSnapshot.sampledAt 必须是规范的 UTC ISO 时间字符串。");
  }
  return value;
}

function parseRoomKind(value: unknown, path: string): RoomKind {
  switch (value) {
    case "control_center":
    case "trade_post":
    case "factory":
    case "power_plant":
    case "dormitory":
    case "office":
    case "meeting_room":
    case "workshop":
    case "training_room":
      return value;
    default:
      return shapeError(`${path} 包含不支持的 RoomKind。`);
  }
}

function parseRotationProfile(value: unknown): RotationProfile {
  switch (value) {
    case "abc_12_6_6":
    case "abc_12_12_12":
    case "main_backup_12_12":
    case "fiammetta_8_8_4_4":
    case "abyssal_7_5_7_5":
      return value;
    default:
      return shapeError("SafeCurrentPlanSnapshot.profile.rotationProfile 无效。");
  }
}

function parseProductionMetric(value: unknown, path: string): AgentProductionMetric {
  switch (value) {
    case "lmd":
    case "pureGold":
    case "experience":
    case "originiumShards":
    case "orundum":
      return value;
    default:
      return shapeError(`${path} 包含不支持的生产指标。`);
  }
}

function parseProductionReason(value: unknown, path: string): DailyProductionUnavailableReason {
  switch (value) {
    case "missing-room-data":
    case "ambiguous-recipe":
    case "missing-drone-data":
      return value;
    default:
      return shapeError(`${path} 包含不支持的不可用原因。`);
  }
}

function parseProductionUnavailable(
  value: unknown,
  index: number,
): SafeCurrentPlanProductionUnavailable {
  const path = `SafeCurrentPlanSnapshot.production.unavailable[${index}]`;
  const record = parseRecord(value, path, ["metric", "reason"]);
  return {
    metric: parseProductionMetric(record.metric, `${path}.metric`),
    reason: parseProductionReason(record.reason, `${path}.reason`),
  };
}

function parseProductionUnavailableList(value: unknown): SafeCurrentPlanProductionUnavailable[] {
  if (!Array.isArray(value) || value.length > AGENT_PRODUCTION_METRICS.length) {
    return shapeError(
      `SafeCurrentPlanSnapshot.production.unavailable 必须是不超过 ${AGENT_PRODUCTION_METRICS.length} 项的数组。`,
    );
  }
  return value.map(parseProductionUnavailable);
}

function parseEstimatedProductionValues(value: unknown): SafeCurrentPlanProductionValues {
  const path = "SafeCurrentPlanSnapshot.production.values";
  const record = parseRecord(value, path, AGENT_PRODUCTION_METRICS);
  return {
    lmd: parseNullableProductionNumber(record.lmd, `${path}.lmd`),
    pureGold: parseNullableProductionNumber(record.pureGold, `${path}.pureGold`),
    experience: parseNullableProductionNumber(record.experience, `${path}.experience`),
    originiumShards: parseNullableProductionNumber(
      record.originiumShards,
      `${path}.originiumShards`,
    ),
    orundum: parseNullableProductionNumber(record.orundum, `${path}.orundum`),
  };
}

function parseSolverProductionValues(value: unknown): SafeCurrentPlanSolverProductionValues {
  const path = "SafeCurrentPlanSnapshot.production.values";
  const record = parseRecord(value, path, AGENT_PRODUCTION_METRICS);
  const parseValue = (metric: AgentProductionMetric): number => (
    parseFiniteNumber(record[metric], `${path}.${metric}`, 0, 1_000_000_000_000)
  );
  return {
    lmd: parseValue("lmd"),
    pureGold: parseValue("pureGold"),
    experience: parseValue("experience"),
    originiumShards: parseValue("originiumShards"),
    orundum: parseValue("orundum"),
  };
}

function parseProduction(value: unknown): SafeCurrentPlanProduction {
  if (!isRecord(value) || !Object.hasOwn(value, "source")) {
    return shapeError("SafeCurrentPlanSnapshot.production 必须是带 source 的对象。");
  }
  if (value.source === "solver") {
    const record = parseRecord(value, "SafeCurrentPlanSnapshot.production", ["source", "values"]);
    return {
      source: "solver",
      values: parseSolverProductionValues(record.values),
    };
  }
  if (value.source === "estimate") {
    const record = parseRecord(
      value,
      "SafeCurrentPlanSnapshot.production",
      ["source", "values", "unavailable"],
    );
    return {
      source: "estimate",
      values: parseEstimatedProductionValues(record.values),
      unavailable: parseProductionUnavailableList(record.unavailable),
    };
  }
  if (value.source === "unavailable") {
    const record = parseRecord(
      value,
      "SafeCurrentPlanSnapshot.production",
      ["source", "reason", "unavailable"],
    );
    if (
      record.reason !== "MISSING_SHIFT_DATA"
      && record.reason !== "MISMATCHED_SHIFT_DATA"
      && record.reason !== "ESTIMATE_INPUT_INCOMPLETE"
    ) {
      return shapeError("SafeCurrentPlanSnapshot.production.reason 无效。");
    }
    return {
      source: "unavailable",
      reason: record.reason,
      unavailable: parseProductionUnavailableList(record.unavailable),
    };
  }
  return shapeError("SafeCurrentPlanSnapshot.production.source 无效。");
}

function parseProfile(value: unknown): SafeCurrentPlanProfile {
  const path = "SafeCurrentPlanSnapshot.profile";
  const record = parseRecord(
    value,
    path,
    ["layoutLabel", "rotationProfile", "ownedOperatorCount"],
  );
  return {
    layoutLabel: parseBoundedString(
      record.layoutLabel,
      `${path}.layoutLabel`,
      MAX_AGENT_LAYOUT_LABEL_LENGTH,
    ),
    rotationProfile: parseRotationProfile(record.rotationProfile),
    ownedOperatorCount: parseInteger(
      record.ownedOperatorCount,
      `${path}.ownedOperatorCount`,
      0,
      MAX_AGENT_OWNED_OPERATOR_COUNT,
    ),
  };
}

function parseRoomCount(value: unknown, index: number): SafeCurrentPlanRoomCount {
  const path = `SafeCurrentPlanSnapshot.roomCounts[${index}]`;
  const record = parseRecord(value, path, ["kind", "count"]);
  return {
    kind: parseRoomKind(record.kind, `${path}.kind`),
    count: parseInteger(record.count, `${path}.count`, 1, MAX_AGENT_CONTEXT_ROOMS),
  };
}

function parseRoomCounts(value: unknown): SafeCurrentPlanRoomCount[] {
  if (!Array.isArray(value) || value.length > AGENT_ROOM_KINDS.length) {
    return shapeError(
      `SafeCurrentPlanSnapshot.roomCounts 必须是不超过 ${AGENT_ROOM_KINDS.length} 项的数组。`,
    );
  }
  return value.map(parseRoomCount);
}

function parseShift(value: unknown, index: number): SafeCurrentPlanShift {
  const path = `SafeCurrentPlanSnapshot.shifts[${index}]`;
  const record = parseRecord(
    value,
    path,
    ["durationHours", "plannedRoomCount", "plannedOccupiedSlots"],
  );
  return {
    durationHours: parseFiniteNumber(
      record.durationHours,
      `${path}.durationHours`,
      0.01,
      MAX_AGENT_SHIFT_DURATION_HOURS,
    ),
    plannedRoomCount: parseInteger(
      record.plannedRoomCount,
      `${path}.plannedRoomCount`,
      0,
      MAX_AGENT_CONTEXT_ROOMS,
    ),
    plannedOccupiedSlots: parseInteger(
      record.plannedOccupiedSlots,
      `${path}.plannedOccupiedSlots`,
      0,
      MAX_AGENT_PLANNED_SLOTS,
    ),
  };
}

function parseShifts(value: unknown): SafeCurrentPlanShift[] {
  if (!Array.isArray(value) || value.length > MAX_AGENT_CONTEXT_SHIFTS) {
    return shapeError(
      `SafeCurrentPlanSnapshot.shifts 必须是不超过 ${MAX_AGENT_CONTEXT_SHIFTS} 项的数组。`,
    );
  }
  return value.map(parseShift);
}

function parseTraining(value: unknown): SafeCurrentPlanTraining | null {
  if (value === null) return null;
  const record = parseRecord(value, "SafeCurrentPlanSnapshot.training", ["shifts"]);
  if (!Array.isArray(record.shifts) || record.shifts.length > MAX_AGENT_CONTEXT_SHIFTS) {
    return shapeError(
      `SafeCurrentPlanSnapshot.training.shifts 必须是不超过 ${MAX_AGENT_CONTEXT_SHIFTS} 项的数组。`,
    );
  }
  return {
    shifts: record.shifts.map((shift, index) => {
      const path = `SafeCurrentPlanSnapshot.training.shifts[${index}]`;
      const parsed = parseRecord(shift, path, ["traineeAssigned", "trainerAssigned"]);
      if (typeof parsed.traineeAssigned !== "boolean" || typeof parsed.trainerAssigned !== "boolean") {
        return shapeError(`${path} 的进驻状态必须是布尔值。`);
      }
      return {
        traineeAssigned: parsed.traineeAssigned,
        trainerAssigned: parsed.trainerAssigned,
      };
    }),
  };
}

function parseCurrentPlan(value: unknown): SafeCurrentPlanSnapshot | null {
  if (value === null) return null;
  const path = "SafeCurrentPlanSnapshot";
  const record = parseRecord(
    value,
    path,
    ["diagnosticId", "profile", "roomCounts", "shifts", "production", "training"],
  );
  return {
    diagnosticId: parseBoundedString(
      record.diagnosticId,
      `${path}.diagnosticId`,
      MAX_AGENT_DIAGNOSTIC_ID_LENGTH,
    ),
    profile: parseProfile(record.profile),
    roomCounts: parseRoomCounts(record.roomCounts),
    shifts: parseShifts(record.shifts),
    production: parseProduction(record.production),
    training: parseTraining(record.training),
  };
}

function assertSnapshotSize(value: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return shapeError("AgentContextSnapshot 必须是可序列化的 JSON-safe 对象。");
  }
  if (serialized === undefined) {
    return shapeError("AgentContextSnapshot 必须是可序列化的 JSON-safe 对象。");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_AGENT_CONTEXT_BYTES) {
    return shapeError(`AgentContextSnapshot 不能超过 ${MAX_AGENT_CONTEXT_BYTES} 字节。`);
  }
}

export function parseAgentContextSnapshot(value: unknown): AgentContextSnapshot {
  assertSnapshotSize(value);
  const path = "AgentContextSnapshot";
  const record = parseRecord(
    value,
    path,
    ["schemaVersion", "contextRevision", "sampledAt", "activeShift", "currentPlan"],
  );
  if (record.schemaVersion !== AGENT_CONTEXT_SCHEMA_VERSION) {
    return shapeError(`AgentContextSnapshot.schemaVersion 必须为 ${AGENT_CONTEXT_SCHEMA_VERSION}。`);
  }
  return {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    contextRevision: parseContextRevision(record.contextRevision),
    sampledAt: parseSampledAt(record.sampledAt),
    activeShift: parseInteger(
      record.activeShift,
      `${path}.activeShift`,
      0,
      MAX_AGENT_CONTEXT_SHIFTS - 1,
    ),
    currentPlan: parseCurrentPlan(record.currentPlan),
  };
}

function validateProduction(production: SafeCurrentPlanProduction): void {
  if (production.source === "solver") return;
  const metrics = production.unavailable.map(({ metric }) => metric);
  if (new Set(metrics).size !== metrics.length) {
    return contractError("production.unavailable 不允许重复生产指标。");
  }
  if (production.source === "estimate") {
    for (const metric of AGENT_PRODUCTION_METRICS) {
      const isUnavailable = metrics.includes(metric);
      if ((production.values[metric] === null) !== isUnavailable) {
        return contractError("estimate production 的空值与 unavailable 不一致。");
      }
    }
  }
}

export function validateAgentContextSnapshot(snapshot: AgentContextSnapshot): void {
  if (!snapshot.currentPlan) {
    if (snapshot.activeShift !== 0) {
      return contractError("没有 currentPlan 时 activeShift 必须为 0。");
    }
    return;
  }

  const plan = snapshot.currentPlan;
  const roomKinds = plan.roomCounts.map(({ kind }) => kind);
  if (new Set(roomKinds).size !== roomKinds.length) {
    return contractError("roomCounts 不允许重复 RoomKind。");
  }
  const totalRooms = plan.roomCounts.reduce((sum, room) => sum + room.count, 0);
  if (totalRooms > MAX_AGENT_CONTEXT_ROOMS) {
    return contractError(`roomCounts 合计不能超过 ${MAX_AGENT_CONTEXT_ROOMS}。`);
  }
  if (plan.shifts.length > 0 && snapshot.activeShift >= plan.shifts.length) {
    return contractError("activeShift 超出现有班次数量。");
  }
  if (plan.shifts.length === 0 && snapshot.activeShift !== 0) {
    return contractError("没有班次时 activeShift 必须为 0。");
  }
  if (plan.shifts.some(({ plannedRoomCount }) => plannedRoomCount > totalRooms)) {
    return contractError("计划房间数不能超过安全快照中的房间总数。");
  }
  if (plan.training && plan.training.shifts.length !== plan.shifts.length) {
    return contractError("training.shifts 数量必须与当前方案班次数量一致。");
  }
  if (
    plan.shifts.length === 0
    && (plan.production.source !== "unavailable" || plan.production.reason !== "MISSING_SHIFT_DATA")
  ) {
    return contractError("没有班次时 production 必须标记为 MISSING_SHIFT_DATA。");
  }
  validateProduction(plan.production);
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function solverProduction(plan: PublicPlanData): SafeCurrentPlanProduction | null {
  const production = plan.rotation.daily.production;
  if (!production) return null;
  if (![
    production.lmd,
    production.pure_gold,
    production.battle_records,
    production.originium_shards,
    production.orundum,
  ].every(finiteNonNegative)) return null;
  return {
    source: "solver",
    values: {
      lmd: production.lmd,
      pureGold: production.pure_gold / 500,
      experience: production.battle_records,
      originiumShards: production.originium_shards,
      orundum: production.orundum,
    },
  };
}

function safeEstimateValue(value: number | null): number | null {
  return value !== null && finiteNonNegative(value) ? value : null;
}

function productionUnavailable(
  estimate: DailyProductionEstimate,
): SafeCurrentPlanProductionUnavailable[] {
  const candidates: Array<[
    AgentProductionMetric,
    { value: number | null; unavailableReason?: DailyProductionUnavailableReason },
  ]> = [
    ["lmd", estimate.lmdOrders],
    ["pureGold", estimate.gold],
    ["experience", estimate.experience],
    ["originiumShards", estimate.shards],
    ["orundum", estimate.orundum],
  ];
  return candidates.flatMap(([metric, amount]) => amount.value === null
    ? [{ metric, reason: amount.unavailableReason ?? "missing-room-data" }]
    : []);
}

function estimatedProduction(
  plan: PublicPlanData,
  layout: BaseBlueprint,
): SafeCurrentPlanProduction {
  if (plan.maa.plans.length !== plan.rotation.shifts.length) {
    return { source: "unavailable", reason: "MISMATCHED_SHIFT_DATA", unavailable: [] };
  }
  if (plan.maa.plans.length === 0) {
    return { source: "unavailable", reason: "MISSING_SHIFT_DATA", unavailable: [] };
  }
  try {
    const estimate = estimateDailyProduction({ layout, maa: plan.maa, rotation: plan.rotation });
    const values: SafeCurrentPlanProductionValues = {
      lmd: safeEstimateValue(estimate.lmdOrders.value),
      pureGold: safeEstimateValue(estimate.gold.value),
      experience: safeEstimateValue(estimate.experience.value),
      originiumShards: safeEstimateValue(estimate.shards.value),
      orundum: safeEstimateValue(estimate.orundum.value),
    };
    const unavailable = productionUnavailable(estimate);
    if (AGENT_PRODUCTION_METRICS.every((metric) => values[metric] === null)) {
      return { source: "unavailable", reason: "ESTIMATE_INPUT_INCOMPLETE", unavailable };
    }
    return { source: "estimate", values, unavailable };
  } catch {
    return { source: "unavailable", reason: "ESTIMATE_INPUT_INCOMPLETE", unavailable: [] };
  }
}

export function createSafeCurrentPlanSnapshot({
  plan,
  layout,
}: {
  plan: PublicPlanData;
  layout: BaseBlueprint;
}): SafeCurrentPlanSnapshot {
  const shiftCount = Math.min(plan.maa.plans.length, plan.rotation.shifts.length);
  const roomCounts = AGENT_ROOM_KINDS.flatMap((kind) => {
    const count = layout.rooms.filter((room) => room.kind === kind).length;
    return count > 0 ? [{ kind, count }] : [];
  });
  const shifts = Array.from({ length: shiftCount }, (_, index) => {
    const rows = planToRows(
      plan.maa.plans[index],
      plan.rotation.shifts[index],
      layout,
      plan.trainingRoom?.shifts[index],
    );
    return {
      durationHours: plan.rotation.shifts[index]?.duration_hours ?? 0,
      plannedRoomCount: rows.length,
      plannedOccupiedSlots: rows.reduce((sum, row) => sum + row.operatorSlots.length, 0),
    };
  });
  const production = solverProduction(plan) ?? estimatedProduction(plan, layout);

  return {
    diagnosticId: plan.diagnosticId,
    profile: {
      layoutLabel: plan.profile.layout_label,
      rotationProfile: plan.rotation.profile,
      ownedOperatorCount: plan.profile.summary.owned,
    },
    roomCounts,
    shifts,
    production,
    training: plan.trainingRoom
      ? {
          shifts: plan.trainingRoom.shifts.slice(0, shiftCount).map((shift) => ({
            traineeAssigned: Boolean(shift.trainee),
            trainerAssigned: Boolean(shift.trainer),
          })),
        }
      : null,
  };
}
