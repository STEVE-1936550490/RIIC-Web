import { canPreview } from "./planning-preview-access.ts";
import { isIssuedActor, type AgentExecutionContext } from "./execution-context.ts";
import { AgentRunError } from "./run-contract.ts";
export const READ_ONLY_TOOL_NAMES = ["current_plan.get_summary", "current_plan.get_room_detail", "saved_plan.list", "saved_plan.compare"] as const;
export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];
export function canUseTool(name: string, context: AgentExecutionContext): boolean {
  if (name === "plan.preview") return canPreview(context.preview, context.actor, context.snapshot);
  if (!READ_ONLY_TOOL_NAMES.some((item) => item === name) || !isIssuedActor(context.actor)) return false;
  return name.startsWith("current_plan.") ? context.snapshot !== null : true;
}
export function requireToolPolicy(name: string, context: AgentExecutionContext): void {
  if (name !== "plan.preview" && !READ_ONLY_TOOL_NAMES.some((item) => item === name)) throw new AgentRunError("AGENT_UNKNOWN_TOOL");
  if (!canUseTool(name, context)) throw new AgentRunError("AGENT_TOOL_FORBIDDEN");
}
