// Synthetic-only test helpers. Never imported by the application.
import { register, registerHooks } from "node:module";
register("../../../scripts/ts-path-loader.mjs", import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "server-only" ? { shortCircuit: true, url: "data:text/javascript,export{}" } : nextResolve(specifier, context);
} });
const { actorFromWebsiteSession } = await import("./execution-context.ts");
const { createSafeCurrentPlanSnapshot } = await import("./context-contract.ts");
const { syntheticSavedPlan, savedPlanComparisonTestContext, savedPlanTestActor } = await import("./saved-plan-test-fixtures.ts");
const { createSavedPlanReadService } = await import("../saved-plan-read-service.ts");
export function syntheticExecution() {
  const rows = [syntheticSavedPlan("left"), syntheticSavedPlan("right"), syntheticSavedPlan("foreign", "synthetic-other")];
  rows[0].title = "same title"; rows[1].title = "same title";
  const row = rows[0];
  const snapshot = { schemaVersion: 1 as const, contextRevision: "synthetic-rev-1", sampledAt: "2026-09-07T00:00:00.000Z", activeShift: 0,
    currentPlan: createSafeCurrentPlanSnapshot({ plan: row.publicResult, layout: row.calculationContext.layout, includeRoomDetails: true }) };
  const savedPlans = createSavedPlanReadService({ requireConsent: async () => {}, loadMetadata: async () => rows, now: () => new Date("2026-09-07T00:00:00.000Z") });
  return { actor: actorFromWebsiteSession({ user: { id: savedPlanTestActor.userId } }, "synthetic-request"), snapshot, savedPlans, comparison: savedPlanComparisonTestContext(rows).service };
}
export const syntheticEgress = { classification: "synthetic" as const, localTestApproved: false };
export const call = (name = "current_plan.get_summary", args: unknown = {}, id = "call-1") => ({ type: "calls" as const, calls: [{ id, name, arguments: args }] });
export const final = { type: "final" as const, answer: "synthetic final" };
