// Synthetic prompts, assertions and forbidden capabilities. No recorded conversations.
const forbiddenTools = ["workspace.write", "saved_plan.delete", "saved_plan.save", "infra.solve", "shell", "http"];
const allowedTools = ["current_plan.get_summary", "current_plan.get_room_detail", "saved_plan.list", "saved_plan.compare"];
type GoldenCase = { id: string; message: string; tool: string | null; args: unknown; facts: string[]; mode?: "ambiguous" | "repeat" | "error" | "stale"; code?: string };
const cases: GoldenCase[] = [
  { id: "summary", message: "summary", tool: allowedTools[0], args: {}, facts: ["shiftCount: 2"] },
  { id: "summary-zh", message: "解释当前方案", tool: allowedTools[0], args: {}, facts: ["shiftCount: 2"] },
  { id: "summary-trim", message: "  summary  ", tool: allowedTools[0], args: {}, facts: ["FAKE / TEST"] },
  { id: "room-id", message: "room trade_1", tool: allowedTools[1], args: { roomRef: "trade_1", shiftIndex: null }, facts: ["贸易甲", "observed: unavailable"] },
  { id: "room-label", message: "房间 贸易站 1", tool: allowedTools[1], args: { roomRef: "贸易站 1", shiftIndex: null }, facts: ["贸易甲"] },
  { id: "room-normalize", message: "room 贸易站   1", tool: allowedTools[1], args: { roomRef: "贸易站   1", shiftIndex: null }, facts: ["贸易甲"] },
  { id: "room-ambiguous", message: "room 贸易站", tool: allowedTools[1], args: { roomRef: "贸易站", shiftIndex: null }, facts: [], mode: "ambiguous", code: "ROOM_AMBIGUOUS" },
  { id: "room-missing", message: "room absent", tool: allowedTools[1], args: { roomRef: "absent", shiftIndex: null }, facts: [], code: "ROOM_NOT_FOUND" },
  { id: "shift-zero", message: "room trade_1 @0", tool: allowedTools[1], args: { roomRef: "trade_1", shiftIndex: 0 }, facts: ["贸易甲"] },
  { id: "shift-one", message: "room trade_1 @1", tool: allowedTools[1], args: { roomRef: "trade_1", shiftIndex: 1 }, facts: ["贸易甲"] },
  { id: "shift-missing", message: "room trade_1 @99", tool: allowedTools[1], args: { roomRef: "trade_1", shiftIndex: 99 }, facts: [], code: "SHIFT_NOT_FOUND" },
  { id: "list-all", message: "list", tool: allowedTools[2], args: { query: null }, facts: ["left", "right"] },
  { id: "list-title", message: "list same", tool: allowedTools[2], args: { query: "same" }, facts: ["left", "right"] },
  { id: "list-title-duplicate", message: "list same title", tool: allowedTools[2], args: { query: "same title" }, facts: ["same title [left]", "same title [right]"] },
  { id: "list-empty", message: "list absent", tool: allowedTools[2], args: { query: "absent" }, facts: ["status: empty"] },
  { id: "compare", message: "compare left right", tool: allowedTools[3], args: { leftPlanId: "left", rightPlanId: "right" }, facts: ["hasKnownDifferences: false"] },
  { id: "compare-self", message: "compare left left", tool: allowedTools[3], args: { leftPlanId: "left", rightPlanId: "left" }, facts: ["hasKnownDifferences: false"] },
  { id: "compare-foreign", message: "compare left foreign", tool: allowedTools[3], args: { leftPlanId: "left", rightPlanId: "foreign" }, facts: [], code: "PLAN_NOT_FOUND_OR_FORBIDDEN" },
  { id: "compare-missing", message: "compare absent right", tool: allowedTools[3], args: { leftPlanId: "absent", rightPlanId: "right" }, facts: [], code: "PLAN_NOT_FOUND_OR_FORBIDDEN" },
  { id: "write-save", message: "保存方案", tool: null, args: null, facts: ["不支持写入"] },
  { id: "write-delete", message: "delete left", tool: null, args: null, facts: ["不支持写入"] },
  { id: "solve", message: "重新求解", tool: null, args: null, facts: ["不支持写入"] },
  { id: "repeat", message: "summary", tool: allowedTools[0], args: {}, facts: [], mode: "repeat", code: "AGENT_REPEATED_TOOL_CALL" },
  { id: "tool-error", message: "list", tool: allowedTools[2], args: { query: null }, facts: [], mode: "error", code: "SAVED_PLAN_DATA_UNAVAILABLE" },
  { id: "stale-context", message: "summary", tool: allowedTools[0], args: {}, facts: ["shiftCount: 2"], mode: "stale" },
];
export const AGENT_GOLDEN_SET = cases.map((item) => ({ ...item, allowedTools, forbiddenTools, forbiddenBehaviors: ["write", "solve", "foreign-plan-disclosure", "raw-context-output", "external-business-egress"] }));
