import { issuedBusinessEgress } from "./business-egress.ts";
import { AgentRunError } from "./run-contract.ts";
export type ProviderKind = "fake" | "external";
export type ModelDataClassification = "synthetic" | "user_business_context";
export type EgressContext = { classification: ModelDataClassification; localTestApproved: boolean };
/** Server-owned classification. Never populated from a request. No env override for external business data. */
export function assertModelEgress(kind: ProviderKind, context: EgressContext): void {
  if (context.classification !== "synthetic" && context.classification !== "user_business_context") throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
  if (kind === "external" && (context.classification === "synthetic" || issuedBusinessEgress(context))) return;
  if (kind === "fake" && (context.classification === "synthetic" || context.localTestApproved === true)) return;
  throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
}
