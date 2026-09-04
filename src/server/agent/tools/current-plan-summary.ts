import {
  AGENT_ROOM_KINDS,
  AgentContextContractError,
  AgentContextShapeError,
  parseAgentContextSnapshot,
  validateAgentContextSnapshot,
  type AgentContextSnapshot,
  type SafeCurrentPlanProduction,
  type SafeCurrentPlanProductionUnavailable,
  type SafeCurrentPlanProfile,
  type SafeCurrentPlanRoomCount,
  type SafeCurrentPlanShift,
} from "../context-contract.ts";

export const CURRENT_PLAN_SUMMARY_TOOL = {
  name: "current_plan.get_summary",
  effect: "read",
  description: "读取用户当前页面提供的排班方案公开摘要。不重新求解，不读取数据库，不修改任何数据。",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

export const MAX_CURRENT_PLAN_SUMMARY_SHIFTS = 4;
export const MAX_CURRENT_PLAN_SUMMARY_ROOM_KINDS = AGENT_ROOM_KINDS.length;
export const MAX_CURRENT_PLAN_SUMMARY_TRAINING_ITEMS = 4;
export const MAX_CURRENT_PLAN_SUMMARY_LIMITATIONS = 6;
export const MAX_CURRENT_PLAN_SUMMARY_RESULT_BYTES = 16 * 1024;

export type CurrentPlanSummaryToolInput = Record<string, never>;

export type CurrentPlanToolExecutionContext = {
  snapshot: unknown;
};

export type CurrentPlanToolErrorCode =
  | "AGENT_TOOL_INVALID_INPUT"
  | "CURRENT_PLAN_SUMMARY_INTERNAL_ERROR";

export class CurrentPlanToolInputError extends Error {
  readonly code = "AGENT_TOOL_INVALID_INPUT" as const;

  constructor() {
    super("current_plan.get_summary 只接受严格空对象参数。");
    this.name = "CurrentPlanToolInputError";
  }
}

export class CurrentPlanToolInternalError extends Error {
  readonly code = "CURRENT_PLAN_SUMMARY_INTERNAL_ERROR" as const;

  constructor() {
    super("current_plan.get_summary 无法生成安全摘要。");
    this.name = "CurrentPlanToolInternalError";
  }
}

export function parseCurrentPlanSummaryInput(value: unknown): CurrentPlanSummaryToolInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CurrentPlanToolInputError();
  }
  if (Object.keys(value).length !== 0) throw new CurrentPlanToolInputError();
  return {};
}

export type CurrentPlanToolSource = {
  type: "current_context";
  contextRevision: string;
  planDiagnosticId: string | null;
  sampledAt: string;
};

export type CurrentPlanSummaryLimitation =
  | ({ code: "PRODUCTION_VALUE_UNAVAILABLE" } & SafeCurrentPlanProductionUnavailable)
  | { code: "TRAINING_SUMMARY_UNAVAILABLE"; reason: "NO_TRAINING_SCHEDULE" };

export type CurrentPlanSummaryData = {
  profile: SafeCurrentPlanProfile;
  activeShift: ({ index: number } & SafeCurrentPlanShift) | null;
  shiftCount: number;
  shifts: Array<{ index: number } & SafeCurrentPlanShift>;
  rooms: {
    total: number;
    byKind: SafeCurrentPlanRoomCount[];
  };
  production: SafeCurrentPlanProduction;
  training:
    | {
        status: "available";
        shiftCount: number;
        assignments: Array<{
          shiftIndex: number;
          traineeAssigned: boolean;
          trainerAssigned: boolean;
        }>;
      }
    | {
        status: "unavailable";
        reason: "NO_TRAINING_SCHEDULE";
      };
  limitations: CurrentPlanSummaryLimitation[];
};

type CurrentPlanSummaryResultBase = {
  source: CurrentPlanToolSource;
  truncation: {
    applied: boolean;
    omittedCount: number;
  };
};

export type CurrentPlanSummaryResult =
  | (CurrentPlanSummaryResultBase & {
      status: "ok";
      data: CurrentPlanSummaryData;
    })
  | (CurrentPlanSummaryResultBase & {
      status: "missing";
      issue: {
        code: "NO_CURRENT_PLAN";
        message: string;
      };
    })
  | (CurrentPlanSummaryResultBase & {
      status: "unavailable";
      data: CurrentPlanSummaryData;
      issue: {
        code: "CURRENT_PLAN_SHIFT_DATA_UNAVAILABLE" | "CURRENT_PLAN_PRODUCTION_UNAVAILABLE";
        message: string;
      };
    });

function sourceFor(snapshot: AgentContextSnapshot): CurrentPlanToolSource {
  return {
    type: "current_context",
    contextRevision: snapshot.contextRevision,
    planDiagnosticId: snapshot.currentPlan?.diagnosticId ?? null,
    sampledAt: snapshot.sampledAt,
  };
}

function copyProduction(production: SafeCurrentPlanProduction): SafeCurrentPlanProduction {
  if (production.source === "solver") {
    return { source: "solver", values: { ...production.values } };
  }
  if (production.source === "estimate") {
    return {
      source: "estimate",
      values: { ...production.values },
      unavailable: production.unavailable.map((item) => ({ ...item })),
    };
  }
  return {
    source: "unavailable",
    reason: production.reason,
    unavailable: production.unavailable.map((item) => ({ ...item })),
  };
}

function resultByteLength(value: CurrentPlanSummaryResult): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertResultSize(result: CurrentPlanSummaryResult): CurrentPlanSummaryResult {
  if (resultByteLength(result) > MAX_CURRENT_PLAN_SUMMARY_RESULT_BYTES) {
    throw new CurrentPlanToolInternalError();
  }
  return result;
}

function buildSummaryResult(snapshot: AgentContextSnapshot): CurrentPlanSummaryResult {
  const source = sourceFor(snapshot);
  const plan = snapshot.currentPlan;
  if (!plan) {
    return assertResultSize({
      status: "missing",
      source,
      issue: {
        code: "NO_CURRENT_PLAN",
        message: "当前页面没有可用的排班方案。",
      },
      truncation: { applied: false, omittedCount: 0 },
    });
  }

  const allShifts = plan.shifts.map((shift, index) => ({ index, ...shift }));
  const shifts = allShifts.slice(0, MAX_CURRENT_PLAN_SUMMARY_SHIFTS);
  const roomKinds = plan.roomCounts.slice(0, MAX_CURRENT_PLAN_SUMMARY_ROOM_KINDS)
    .map((room) => ({ ...room }));
  const activeShift = plan.shifts[snapshot.activeShift];
  const allTrainingAssignments = plan.training?.shifts.map((shift, shiftIndex) => ({
    shiftIndex,
    ...shift,
  })) ?? [];
  const trainingAssignments = allTrainingAssignments.slice(0, MAX_CURRENT_PLAN_SUMMARY_TRAINING_ITEMS);
  const allLimitations: CurrentPlanSummaryLimitation[] = [
    ...(plan.production.source === "solver"
      ? []
      : plan.production.unavailable.map((item) => ({
          code: "PRODUCTION_VALUE_UNAVAILABLE" as const,
          ...item,
        }))),
    ...(plan.training
      ? []
      : [{
          code: "TRAINING_SUMMARY_UNAVAILABLE" as const,
          reason: "NO_TRAINING_SCHEDULE" as const,
        }]),
  ];
  const limitations = allLimitations.slice(0, MAX_CURRENT_PLAN_SUMMARY_LIMITATIONS);
  const omittedCount = (allShifts.length - shifts.length)
    + (plan.roomCounts.length - roomKinds.length)
    + (allTrainingAssignments.length - trainingAssignments.length)
    + (allLimitations.length - limitations.length);
  const data: CurrentPlanSummaryData = {
    profile: { ...plan.profile },
    activeShift: activeShift ? { index: snapshot.activeShift, ...activeShift } : null,
    shiftCount: plan.shifts.length,
    shifts,
    rooms: {
      total: plan.roomCounts.reduce((sum, room) => sum + room.count, 0),
      byKind: roomKinds,
    },
    production: copyProduction(plan.production),
    training: plan.training
      ? {
          status: "available",
          shiftCount: plan.training.shifts.length,
          assignments: trainingAssignments,
        }
      : {
          status: "unavailable",
          reason: "NO_TRAINING_SCHEDULE",
        },
    limitations,
  };
  const truncation = { applied: omittedCount > 0, omittedCount };

  if (!activeShift) {
    return assertResultSize({
      status: "unavailable",
      source,
      data,
      issue: {
        code: "CURRENT_PLAN_SHIFT_DATA_UNAVAILABLE",
        message: "当前方案缺少可用班次摘要。",
      },
      truncation,
    });
  }
  if (plan.production.source === "unavailable") {
    return assertResultSize({
      status: "unavailable",
      source,
      data,
      issue: {
        code: "CURRENT_PLAN_PRODUCTION_UNAVAILABLE",
        message: "当前方案缺少生成生产摘要所需的公开数据。",
      },
      truncation,
    });
  }
  return assertResultSize({ status: "ok", source, data, truncation });
}

export function executeCurrentPlanSummary(
  input: unknown,
  context: CurrentPlanToolExecutionContext,
): CurrentPlanSummaryResult {
  parseCurrentPlanSummaryInput(input);
  const snapshot = parseAgentContextSnapshot(context.snapshot);
  validateAgentContextSnapshot(snapshot);
  try {
    return buildSummaryResult(snapshot);
  } catch (error: unknown) {
    if (
      error instanceof AgentContextShapeError
      || error instanceof AgentContextContractError
      || error instanceof CurrentPlanToolInputError
      || error instanceof CurrentPlanToolInternalError
    ) {
      throw error;
    }
    throw new CurrentPlanToolInternalError();
  }
}
