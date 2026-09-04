export const AGENT_INTENTS = [
  "explain_current_plan",
  "get_room_detail",
  "compare_saved_plans",
  "unsupported",
] as const;

export const AGENT_MISSING_FIELDS = [
  "roomRef",
  "leftPlanRef",
  "rightPlanRef",
] as const;

export const MAX_AGENT_REFERENCE_LENGTH = 200;

export type AgentIntent = (typeof AGENT_INTENTS)[number];
export type AgentMissingField = (typeof AGENT_MISSING_FIELDS)[number];

export type AgentIntentDecision = {
  intent: AgentIntent;
  roomRef: string | null;
  leftPlanRef: string | null;
  rightPlanRef: string | null;
  missingFields: AgentMissingField[];
  canProceed: boolean;
};

export const AGENT_INTENT_DECISION_OUTPUT_CONTRACT = {
  name: "agent_intent_decision",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "intent",
      "roomRef",
      "leftPlanRef",
      "rightPlanRef",
      "missingFields",
      "canProceed",
    ],
    properties: {
      intent: { type: "string", enum: AGENT_INTENTS },
      roomRef: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: MAX_AGENT_REFERENCE_LENGTH },
          { type: "null" },
        ],
      },
      leftPlanRef: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: MAX_AGENT_REFERENCE_LENGTH },
          { type: "null" },
        ],
      },
      rightPlanRef: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: MAX_AGENT_REFERENCE_LENGTH },
          { type: "null" },
        ],
      },
      missingFields: {
        type: "array",
        maxItems: AGENT_MISSING_FIELDS.length,
        items: { type: "string", enum: AGENT_MISSING_FIELDS },
      },
      canProceed: { type: "boolean" },
    },
  },
} as const;

const DECISION_KEYS = [
  "intent",
  "roomRef",
  "leftPlanRef",
  "rightPlanRef",
  "missingFields",
  "canProceed",
] as const;

export class AgentIntentShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentIntentShapeError";
  }
}

export class AgentIntentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentIntentContractError";
  }
}

function shapeError(message: string): never {
  throw new AgentIntentShapeError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseIntent(value: unknown): AgentIntent {
  switch (value) {
    case "explain_current_plan":
    case "get_room_detail":
    case "compare_saved_plans":
    case "unsupported":
      return value;
    default:
      return shapeError("intent 包含不支持的枚举值。");
  }
}

function parseReference(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return shapeError(`${field} 必须是字符串或 null。`);
  if (value.trim().length === 0 || value.length > MAX_AGENT_REFERENCE_LENGTH) {
    return shapeError(`${field} 必须是 1–${MAX_AGENT_REFERENCE_LENGTH} 个字符的非空引用文本。`);
  }
  return value;
}

function parseMissingField(value: unknown, index: number): AgentMissingField {
  switch (value) {
    case "roomRef":
    case "leftPlanRef":
    case "rightPlanRef":
      return value;
    default:
      return shapeError(`missingFields[${index}] 包含不支持的枚举值。`);
  }
}

function parseMissingFields(value: unknown): AgentMissingField[] {
  if (!Array.isArray(value)) return shapeError("missingFields 必须是数组。");
  if (value.length > AGENT_MISSING_FIELDS.length) {
    return shapeError(`missingFields 不能超过 ${AGENT_MISSING_FIELDS.length} 项。`);
  }
  return value.map(parseMissingField);
}

export function parseAgentIntentDecision(value: unknown): AgentIntentDecision {
  if (!isRecord(value)) return shapeError("AgentIntentDecision 必须是对象。");

  for (const key of DECISION_KEYS) {
    if (!Object.hasOwn(value, key)) return shapeError(`AgentIntentDecision 缺少字段 ${key}。`);
  }
  const additionalKey = Object.keys(value).find(
    (key) => !DECISION_KEYS.some((expected) => expected === key),
  );
  if (additionalKey) return shapeError(`AgentIntentDecision 不允许额外字段 ${additionalKey}。`);

  if (typeof value.canProceed !== "boolean") return shapeError("canProceed 必须是布尔值。");

  return {
    intent: parseIntent(value.intent),
    roomRef: parseReference(value.roomRef, "roomRef"),
    leftPlanRef: parseReference(value.leftPlanRef, "leftPlanRef"),
    rightPlanRef: parseReference(value.rightPlanRef, "rightPlanRef"),
    missingFields: parseMissingFields(value.missingFields),
    canProceed: value.canProceed,
  };
}

function sameMissingFields(
  actual: readonly AgentMissingField[],
  expected: readonly AgentMissingField[],
): boolean {
  return actual.length === expected.length
    && expected.every((field) => actual.includes(field));
}

function requireNull(value: string | null, field: string, intent: AgentIntent): void {
  if (value !== null) {
    throw new AgentIntentContractError(`${intent} 不允许携带 ${field}。`);
  }
}

function requireMissingFields(
  decision: AgentIntentDecision,
  expected: readonly AgentMissingField[],
): void {
  if (!sameMissingFields(decision.missingFields, expected)) {
    throw new AgentIntentContractError("missingFields 与实际缺失的业务引用不一致。");
  }
}

function requireCanProceed(decision: AgentIntentDecision, expected: boolean): void {
  if (decision.canProceed !== expected) {
    throw new AgentIntentContractError("canProceed 与业务引用是否齐备不一致。");
  }
}

export function validateAgentIntentDecision(decision: AgentIntentDecision): void {
  switch (decision.intent) {
    case "explain_current_plan":
      requireNull(decision.roomRef, "roomRef", decision.intent);
      requireNull(decision.leftPlanRef, "leftPlanRef", decision.intent);
      requireNull(decision.rightPlanRef, "rightPlanRef", decision.intent);
      requireMissingFields(decision, []);
      requireCanProceed(decision, true);
      return;
    case "get_room_detail": {
      requireNull(decision.leftPlanRef, "leftPlanRef", decision.intent);
      requireNull(decision.rightPlanRef, "rightPlanRef", decision.intent);
      const expectedMissingFields: AgentMissingField[] = decision.roomRef === null ? ["roomRef"] : [];
      requireMissingFields(decision, expectedMissingFields);
      requireCanProceed(decision, decision.roomRef !== null);
      return;
    }
    case "compare_saved_plans": {
      requireNull(decision.roomRef, "roomRef", decision.intent);
      const expectedMissingFields: AgentMissingField[] = [];
      if (decision.leftPlanRef === null) expectedMissingFields.push("leftPlanRef");
      if (decision.rightPlanRef === null) expectedMissingFields.push("rightPlanRef");
      requireMissingFields(decision, expectedMissingFields);
      requireCanProceed(decision, expectedMissingFields.length === 0);
      return;
    }
    case "unsupported":
      requireCanProceed(decision, false);
  }
}
