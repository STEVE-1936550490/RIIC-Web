import {
  AGENT_ROOM_EFFICIENCY_FIELDS,
  parseAgentContextSnapshot,
  validateAgentContextSnapshot,
  type SafeCurrentPlanRoom,
  type SafeObservedScheduleSnapshot,
  type SafeRoomEfficiency,
} from "../context-contract.ts";
import type { CurrentPlanToolExecutionContext, CurrentPlanToolSource } from "./current-plan-summary.ts";
import { resolveCurrentPlanRooms } from "./current-plan-room-resolver.ts";

export const MAX_CURRENT_PLAN_ROOM_REF_LENGTH = 200;
export const MAX_ROOM_DETAIL_CANDIDATES = 8;
export const MAX_ROOM_DETAIL_PLANNED_OPERATORS = 5;
export const MAX_ROOM_DETAIL_OBSERVED_OPERATORS = 5;
export const MAX_ROOM_DETAIL_LIMITATIONS = 2;
export const MAX_ROOM_DETAIL_RESULT_BYTES = 4096;

export const CURRENT_PLAN_ROOM_DETAIL_TOOL = {
  name: "current_plan.get_room_detail",
  effect: "read",
  description: "读取指定房间的计划排班与可选采样观测，分别标明来源，不修改排班。",
  inputSchema: {
    type: "object",
    properties: {
      roomRef: { type: "string", minLength: 1, maxLength: MAX_CURRENT_PLAN_ROOM_REF_LENGTH },
      shiftIndex: { anyOf: [{ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, { type: "null" }] },
    },
    required: ["roomRef", "shiftIndex"],
    additionalProperties: false,
  },
} as const;

export type CurrentPlanRoomDetailInput = { roomRef: string; shiftIndex: number | null };

export class CurrentPlanRoomDetailInputError extends Error {
  readonly code = "AGENT_TOOL_INVALID_INPUT" as const;
  constructor() {
    super("current_plan.get_room_detail 需要非空 roomRef 和非负整数或 null 的 shiftIndex，不允许额外字段。");
    this.name = "CurrentPlanRoomDetailInputError";
  }
}

export function parseCurrentPlanRoomDetailInput(value: unknown): CurrentPlanRoomDetailInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Object.hasOwn(value, "roomRef") || !Object.hasOwn(value, "shiftIndex")
    || Object.keys(value).some((key) => key !== "roomRef" && key !== "shiftIndex")
    || !("roomRef" in value) || !("shiftIndex" in value)
    || typeof value.roomRef !== "string"
    || [...value.roomRef].length > MAX_CURRENT_PLAN_ROOM_REF_LENGTH || !value.roomRef.trim()
    || (value.shiftIndex !== null && (typeof value.shiftIndex !== "number"
      || !Number.isSafeInteger(value.shiftIndex) || value.shiftIndex < 0))) {
    throw new CurrentPlanRoomDetailInputError();
  }
  return { roomRef: value.roomRef.trim(), shiftIndex: value.shiftIndex };
}

type RoomReference = Pick<SafeCurrentPlanRoom, "roomId" | "label" | "kind" | "index">;
type ShiftSelection = {
  requestedShiftIndex: number | null;
  resolvedShiftIndex: number;
  usedActiveShift: boolean;
};
type PlannedDetail = {
  product: string | null;
  efficiency: SafeRoomEfficiency | null;
} & (
  | { status: "available" | "empty"; operators: string[] }
  | { status: "unavailable"; operators: null; issue: { code: "ROOM_DATA_UNAVAILABLE" } }
);
type ObservedDetail =
  | { status: "available"; source: { type: "skland_schedule" }; sampledAt: string; operators: string[] }
  | {
      status: "unavailable";
      issue: { code: "OBSERVED_DATA_UNAVAILABLE"; reason: "NO_OBSERVED_SNAPSHOT" | "ROOM_NOT_OBSERVED" };
      source?: { type: "skland_schedule" };
      sampledAt?: string;
    };
type RoomDetailLimitation = "OBSERVED_SNAPSHOT_AT_SAMPLED_AT" | "PLANNED_OCCUPANCY_UNAVAILABLE";
type ResultBase = { source: CurrentPlanToolSource; truncation: { applied: boolean; omittedCount: number } };
type ResolvedDetail = {
  room: RoomReference & { level: number };
  shift: ShiftSelection & { durationHours: number };
  planned: PlannedDetail;
  observed: ObservedDetail;
  limitations: RoomDetailLimitation[];
};
export type CurrentPlanRoomDetailResult = ResultBase & (
  | { status: "ok"; data: ResolvedDetail }
  | { status: "ambiguous"; issue: { code: "ROOM_AMBIGUOUS" }; candidates: RoomReference[] }
  | { status: "missing"; issue: { code: "NO_CURRENT_PLAN" | "ROOM_NOT_FOUND" } }
  | { status: "unavailable"; issue: { code: "SHIFT_NOT_FOUND" }; room: RoomReference; shift: ShiftSelection }
  | { status: "unavailable"; issue: { code: "ROOM_DATA_UNAVAILABLE" }; data?: ResolvedDetail }
);

function reference(room: SafeCurrentPlanRoom): RoomReference {
  return { roomId: room.roomId, label: room.label, kind: room.kind, index: room.index };
}

function observedFor(room: SafeCurrentPlanRoom, schedule: SafeObservedScheduleSnapshot | null | undefined): ObservedDetail {
  if (!schedule) return { status: "unavailable", issue: { code: "OBSERVED_DATA_UNAVAILABLE", reason: "NO_OBSERVED_SNAPSHOT" } };
  const match = schedule.rooms.find((item) => item.kind === room.kind && item.index === room.index);
  const source = { type: "skland_schedule" } as const;
  if (!match) return {
    status: "unavailable", source, sampledAt: schedule.sampledAt,
    issue: { code: "OBSERVED_DATA_UNAVAILABLE", reason: "ROOM_NOT_OBSERVED" },
  };
  return { status: "available", source, sampledAt: schedule.sampledAt, operators: [...match.operators] };
}

/** Counts omitted array entries (or one omitted efficiency object), never JSON characters. */
function truncateResult(result: CurrentPlanRoomDetailResult): CurrentPlanRoomDetailResult {
  const omit = (count: number) => {
    result.truncation.omittedCount += count;
    result.truncation.applied = result.truncation.omittedCount > 0;
  };
  const cap = <T>(items: T[], maximum: number) => {
    if (items.length > maximum) omit(items.splice(maximum).length);
  };
  const detail = "data" in result ? result.data : undefined;
  if (result.status === "ambiguous") cap(result.candidates, MAX_ROOM_DETAIL_CANDIDATES);
  if (detail) {
    if (detail.planned.operators) cap(detail.planned.operators, MAX_ROOM_DETAIL_PLANNED_OPERATORS);
    if (detail.observed.status === "available") cap(detail.observed.operators, MAX_ROOM_DETAIL_OBSERVED_OPERATORS);
    cap(detail.limitations, MAX_ROOM_DETAIL_LIMITATIONS);
  }
  while (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_ROOM_DETAIL_RESULT_BYTES) {
    if (result.status === "ambiguous" && result.candidates.length > 2) result.candidates.pop();
    else if (detail?.observed.status === "available" && detail.observed.operators.length > 1) detail.observed.operators.pop();
    else if (detail?.planned.operators && detail.planned.operators.length > 1) detail.planned.operators.pop();
    else if (detail?.planned.efficiency) detail.planned.efficiency = null;
    else {
      // Bounded identity/source text and at most one operator per side fit below 4 KiB.
      throw new Error("CURRENT_PLAN_ROOM_DETAIL_RESULT_BUDGET_EXCEEDED");
    }
    omit(1);
  }
  return result;
}

export function executeCurrentPlanRoomDetail(input: unknown, context: CurrentPlanToolExecutionContext): CurrentPlanRoomDetailResult {
  const args = parseCurrentPlanRoomDetailInput(input);
  const snapshot = parseAgentContextSnapshot(context.snapshot);
  validateAgentContextSnapshot(snapshot);
  const plan = snapshot.currentPlan;
  const base: ResultBase = {
    source: { type: "current_context", contextRevision: snapshot.contextRevision, planDiagnosticId: plan?.diagnosticId ?? null, sampledAt: snapshot.sampledAt },
    truncation: { applied: false, omittedCount: 0 },
  };
  if (!plan) return truncateResult({ ...base, status: "missing", issue: { code: "NO_CURRENT_PLAN" } });
  if (!plan.rooms) return truncateResult({ ...base, status: "unavailable", issue: { code: "ROOM_DATA_UNAVAILABLE" } });
  const candidates = resolveCurrentPlanRooms(args.roomRef, plan.rooms);
  if (!candidates.length) return truncateResult({ ...base, status: "missing", issue: { code: "ROOM_NOT_FOUND" } });
  if (candidates.length > 1) return truncateResult({
    ...base, status: "ambiguous", issue: { code: "ROOM_AMBIGUOUS" }, candidates: candidates.map(reference),
  });
  const room = candidates[0];
  const shift: ShiftSelection = {
    requestedShiftIndex: args.shiftIndex,
    resolvedShiftIndex: args.shiftIndex ?? snapshot.activeShift,
    usedActiveShift: args.shiftIndex === null,
  };
  const selectedShift = plan.shifts[shift.resolvedShiftIndex];
  if (!selectedShift) return truncateResult({ ...base, status: "unavailable", issue: { code: "SHIFT_NOT_FOUND" }, room: reference(room), shift });
  const assignment = room.shifts[shift.resolvedShiftIndex];
  const efficiency: SafeRoomEfficiency = {};
  for (const key of AGENT_ROOM_EFFICIENCY_FIELDS) {
    const value = assignment.efficiency?.[key];
    if (value !== undefined) efficiency[key] = value;
  }
  const common = { product: assignment.product, efficiency: assignment.efficiency ? efficiency : null };
  const planned: PlannedDetail = assignment.operators === null
    ? { ...common, status: "unavailable", operators: null, issue: { code: "ROOM_DATA_UNAVAILABLE" } }
    : { ...common, status: assignment.operators.length ? "available" : "empty", operators: [...assignment.operators] };
  const observed = observedFor(room, snapshot.observedSchedule);
  const limitations: RoomDetailLimitation[] = [];
  if (planned.status === "unavailable") limitations.push("PLANNED_OCCUPANCY_UNAVAILABLE");
  if (snapshot.observedSchedule) limitations.push("OBSERVED_SNAPSHOT_AT_SAMPLED_AT");
  const data: ResolvedDetail = { room: { ...reference(room), level: room.level }, shift: { ...shift, durationHours: selectedShift.durationHours }, planned, observed, limitations };
  return truncateResult(planned.status === "unavailable"
    ? { ...base, status: "unavailable", issue: { code: "ROOM_DATA_UNAVAILABLE" }, data }
    : { ...base, status: "ok", data });
}
