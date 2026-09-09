import { computePreview } from "../planning-preview-access.ts";
import { parsePreviewInput, PREVIEW_ROTATIONS } from "../preview-contract.ts";
import { AgentRunError } from "../run-contract.ts";
import type { AgentExecutionContext } from "../execution-context.ts";
export const PLAN_PREVIEW_TOOL = {
  name: "plan.preview", description: "Compute one explicitly requested synthetic rotation preview. PREVIEW_ONLY, NOT_SAVED, NOT_APPLIED; never an optimality claim.", effect: "compute" as const,
  inputSchema: { type: "object", properties: { baseRevision: { type: "string", minLength: 1, maxLength: 80 }, rotationProfile: { type: "string", enum: PREVIEW_ROTATIONS } }, required: ["baseRevision", "rotationProfile"], additionalProperties: false },
};
export { parsePreviewInput };
export function executePlanPreview(input: unknown, context: AgentExecutionContext) {
  if (!context.preview || !context.signal) throw new AgentRunError("AGENT_TOOL_FORBIDDEN");
  return computePreview(context.preview, context.actor, context.snapshot, input, context.signal);
}
