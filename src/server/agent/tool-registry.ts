import type { AgentExecutionContext } from "./execution-context.ts";
import { canUseTool, requireToolPolicy } from "./policy.ts";
import { AgentRunError } from "./run-contract.ts";
import { CURRENT_PLAN_SUMMARY_TOOL, executeCurrentPlanSummary, parseCurrentPlanSummaryInput } from "./tools/current-plan-summary.ts";
import { CURRENT_PLAN_ROOM_DETAIL_TOOL, executeCurrentPlanRoomDetail, parseCurrentPlanRoomDetailInput } from "./tools/current-plan-room-detail.ts";
import { SAVED_PLAN_LIST_TOOL, executeSavedPlanList, parseSavedPlanListInput } from "./tools/saved-plan-list.ts";
import { SAVED_PLAN_COMPARE_TOOL, executeSavedPlanCompare, parseSavedPlanCompareInput } from "./tools/saved-plan-compare.ts";

export type ToolResult = ReturnType<typeof executeCurrentPlanSummary> | ReturnType<typeof executeCurrentPlanRoomDetail> | Awaited<ReturnType<typeof executeSavedPlanList>> | Awaited<ReturnType<typeof executeSavedPlanCompare>>;
type Descriptor = { name: string; description: string; effect: "read"; inputSchema: Readonly<Record<string, unknown>>;
  parse(input: unknown): unknown; execute(input: unknown, context: AgentExecutionContext): ToolResult | Promise<ToolResult> };
const registry: readonly Descriptor[] = Object.freeze([
  { ...CURRENT_PLAN_SUMMARY_TOOL, parse: parseCurrentPlanSummaryInput, execute: (input, ctx) => executeCurrentPlanSummary(input, { snapshot: ctx.snapshot }) },
  { ...CURRENT_PLAN_ROOM_DETAIL_TOOL, parse: parseCurrentPlanRoomDetailInput, execute: (input, ctx) => executeCurrentPlanRoomDetail(input, { snapshot: ctx.snapshot }) },
  { ...SAVED_PLAN_LIST_TOOL, description: "List actor-owned saved plan metadata; preserve duplicate titles for disambiguation.", parse: parseSavedPlanListInput,
    execute: (input, ctx) => executeSavedPlanList(input, { actor: { userId: ctx.actor?.userId }, service: ctx.savedPlans }) },
  { ...SAVED_PLAN_COMPARE_TOOL, description: "Compare two actor-owned saved plan IDs deterministically; no writes or solving.", parse: parseSavedPlanCompareInput,
    execute: (input, ctx) => executeSavedPlanCompare(input, { actor: { userId: ctx.actor?.userId }, service: ctx.comparison }) },
]);
export function toolDescriptor(name: string): Descriptor {
  const tool = registry.find((item) => item.name === name);
  if (!tool) throw new AgentRunError("AGENT_UNKNOWN_TOOL"); return tool;
}
export function visibleTools(context: AgentExecutionContext) {
  return registry.filter((tool) => canUseTool(tool.name, context)).map(({ name, description, effect, inputSchema }) => ({ name, description, effect, inputSchema }));
}
export async function executeRegisteredTool(name: string, input: unknown, context: AgentExecutionContext): Promise<ToolResult> {
  requireToolPolicy(name, context);
  const tool = toolDescriptor(name);
  let args: unknown;
  try { args = tool.parse(input); } catch { throw new AgentRunError("AGENT_TOOL_INVALID_INPUT"); }
  // M2 executes its own runtime parser again; domain service rechecks object authorization.
  return tool.execute(args, context);
}
