import "server-only";
import { parseAgentContextSnapshot, validateAgentContextSnapshot, type AgentContextSnapshot } from "./context-contract.ts";
import { AgentRunError, record, text } from "./run-contract.ts";
import type { SavedPlanReadService } from "../saved-plan-read-service.ts";
import type { SavedPlanComparisonReadService } from "../saved-plan-comparison-service.ts";

export type ActorContext = Readonly<{ userId: string; requestId: string; capability: "read"; consent: "domain_checked_at_read" }>;
const issued = new WeakSet<ActorContext>();
/** Call only with requireWebsiteSession's result. Never accept this object in HTTP/model input. */
export function actorFromWebsiteSession(session: unknown, requestId: string): ActorContext {
  const user = record(record(session).user);
  const actor: ActorContext = Object.freeze({ userId: text(user.id, 128), requestId: text(requestId, 80), capability: "read", consent: "domain_checked_at_read" });
  issued.add(actor); return actor;
}
export function isIssuedActor(actor: ActorContext | null): actor is ActorContext { return actor !== null && issued.has(actor); }
export type AgentExecutionContext = {
  actor: ActorContext | null; snapshot: AgentContextSnapshot | null;
  savedPlans: SavedPlanReadService; comparison: SavedPlanComparisonReadService;
};
export function validatedSnapshot(value: unknown): AgentContextSnapshot | null {
  if (value === null) return null;
  try { const snapshot = parseAgentContextSnapshot(value); validateAgentContextSnapshot(snapshot); return snapshot; }
  catch { throw new AgentRunError("AGENT_INVALID_CONTEXT"); }
}
