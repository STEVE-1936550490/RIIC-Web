import "server-only";
import { planAccountAdmissionClass, PublicApiError } from "./api-contract.ts";
export type PlanningActor = Readonly<{ userId: string | null; accountClass: "new" | "established" | null }>;
const issued = new WeakSet<PlanningActor>();
/** Server session only. A serialized or model-generated actor is never valid. */
export function planningActorFromSession(session: { user: { id: string; createdAt?: unknown; emailVerified?: unknown } } | null): PlanningActor {
  if (session && (typeof session.user.id !== "string" || !session.user.id)) throw new PublicApiError("AIC-AUTH-2008");
  const actor = Object.freeze({ userId: session?.user.id ?? null, accountClass: session ? planAccountAdmissionClass({ createdAt: session.user.createdAt, emailVerified: session.user.emailVerified }) : null });
  issued.add(actor); return actor;
}
export function assertPlanningActor(actor: PlanningActor): void {
  if (!issued.has(actor)) throw new PublicApiError("AIC-AUTH-2008");
}
