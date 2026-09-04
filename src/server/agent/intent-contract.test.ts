import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentIntentContractError,
  AgentIntentShapeError,
  MAX_AGENT_REFERENCE_LENGTH,
  parseAgentIntentDecision,
  validateAgentIntentDecision,
  type AgentIntentDecision,
} from "./intent-contract.ts";

const validDecisions = [
  {
    intent: "explain_current_plan",
    roomRef: null,
    leftPlanRef: null,
    rightPlanRef: null,
    missingFields: [],
    canProceed: true,
  },
  {
    intent: "get_room_detail",
    roomRef: "制造站 1",
    leftPlanRef: null,
    rightPlanRef: null,
    missingFields: [],
    canProceed: true,
  },
  {
    intent: "get_room_detail",
    roomRef: null,
    leftPlanRef: null,
    rightPlanRef: null,
    missingFields: ["roomRef"],
    canProceed: false,
  },
  {
    intent: "compare_saved_plans",
    roomRef: null,
    leftPlanRef: "昨天的 243",
    rightPlanRef: "今天的 243",
    missingFields: [],
    canProceed: true,
  },
  {
    intent: "compare_saved_plans",
    roomRef: null,
    leftPlanRef: null,
    rightPlanRef: "方案 B",
    missingFields: ["leftPlanRef"],
    canProceed: false,
  },
  {
    intent: "compare_saved_plans",
    roomRef: null,
    leftPlanRef: "方案 A",
    rightPlanRef: null,
    missingFields: ["rightPlanRef"],
    canProceed: false,
  },
  {
    intent: "compare_saved_plans",
    roomRef: null,
    leftPlanRef: null,
    rightPlanRef: null,
    missingFields: ["rightPlanRef", "leftPlanRef"],
    canProceed: false,
  },
  {
    intent: "unsupported",
    roomRef: null,
    leftPlanRef: null,
    rightPlanRef: null,
    missingFields: [],
    canProceed: false,
  },
] satisfies AgentIntentDecision[];

test("accepts every valid AgentIntentDecision state", () => {
  for (const value of validDecisions) {
    const decision = parseAgentIntentDecision(value);
    assert.doesNotThrow(() => validateAgentIntentDecision(decision));
    assert.deepEqual(decision, value);
  }
});

test("shape validation rejects malformed structured output", () => {
  const base = validDecisions[0];
  const invalidValues: unknown[] = [
    { ...base, intent: "delete_everything" },
    {
      intent: "explain_current_plan",
      roomRef: null,
      leftPlanRef: null,
      rightPlanRef: null,
      missingFields: [],
    },
    { ...base, canProceed: "true" },
    { ...base, providerRequestId: "provider-secret" },
    { ...base, missingFields: ["planRef"] },
    { ...base, roomRef: 42 },
    { ...base, leftPlanRef: undefined },
    { ...base, rightPlanRef: "x".repeat(MAX_AGENT_REFERENCE_LENGTH + 1) },
    { ...base, roomRef: "   " },
    { ...base, missingFields: "roomRef" },
  ];

  for (const value of invalidValues) {
    assert.throws(() => parseAgentIntentDecision(value), AgentIntentShapeError);
  }
});

test("semantic validation is distinct from shape validation", () => {
  const invalidDecisions: unknown[] = [
    { ...validDecisions[0], roomRef: "制造站 1" },
    { ...validDecisions[2], missingFields: [], canProceed: true },
    { ...validDecisions[4], canProceed: true },
    { ...validDecisions[5], missingFields: ["leftPlanRef"] },
    { ...validDecisions[6], missingFields: ["leftPlanRef", "leftPlanRef"] },
    { ...validDecisions[7], canProceed: true },
  ];

  for (const value of invalidDecisions) {
    const decision = parseAgentIntentDecision(value);
    assert.throws(() => validateAgentIntentDecision(decision), AgentIntentContractError);
  }
});
