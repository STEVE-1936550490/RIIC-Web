import "server-only";
import { createPlanningService, planningDependencies } from "../planning-service.ts";
import { planningActorFromSession } from "../planning-actor.ts";
import { rotationDurations } from "../../rotation-settings.ts";
import type { PlanApiResponse } from "../../types.ts";
import { previewExample, previewExampleSnapshot, PREVIEW_EXAMPLE_REVISION } from "./preview-example.ts";
import { issuePreviewAccess } from "./planning-preview-access.ts";
import { requestedPreview } from "./preview-contract.ts";
import type { ActorContext } from "./execution-context.ts";
import type { AgentContextSnapshot } from "./context-contract.ts";
import { AgentRunError } from "./run-contract.ts";

/** Offline-only solver boundary. These numbers are authored examples, not solver predictions. */
export const syntheticPlanningDependencies: typeof planningDependencies = {
  ...planningDependencies,
  getSampleOperbox: async () => ({ operbox: ["中枢甲", "贸易甲", "制造甲", "发电甲"].map((name, index) => ({ id: `char_synthetic_${index}`, name, elite: 2, level: 90, own: true, potential: 1, rarity: 6 })) }) as Awaited<ReturnType<typeof planningDependencies.getSampleOperbox>>,
  getPlanCacheSolverIdentity: async () => null,
  isAccountCloudSyncEnabled: () => false,
  recordPlanRunBestEffort: async () => true,
  describePlanArtifact: async () => null,
  runPlan: async (raw) => {
    const input = raw as { rotation: "main_backup_12_12" | "abc_12_6_6" | "abc_12_12_12" };
    const { publicResult: plan } = previewExample();
    const durations = rotationDurations(input.rotation);
    plan.profile.rotation_profile = input.rotation;
    plan.rotation!.profile = input.rotation;
    plan.rotation!.shifts = durations.map((duration, index) => ({ ...plan.rotation!.shifts[0], index, duration_hours: duration }));
    plan.maa.plans = durations.map((_, index) => ({ ...plan.maa.plans[0], name: `合成 ${index}` }));
    plan.trainingRoom = undefined;
    plan.rotation!.daily.production!.lmd = input.rotation === "main_backup_12_12" ? 100 : 120;
    return { success: true, runId: "m4-synthetic-preview", durationMs: 0, profileJson: plan.profile, maaJson: plan.maa, rotationJson: plan.rotation } as PlanApiResponse;
  },
};
const execute = createPlanningService(syntheticPlanningDependencies);
/** Called only after the API's server-owned fakeAllowed check. Never classifies HTTP data as synthetic egress. */
export function syntheticPreviewAccess(input: { actor: ActorContext; session: unknown; snapshot: AgentContextSnapshot | null; message: string; ip: string }) {
  const rotationProfile = requestedPreview(input.message);
  if (!rotationProfile) return undefined;
  const snapshot = input.snapshot;
  if (!snapshot || snapshot.activeShift !== 0 || snapshot.observedSchedule || JSON.stringify(snapshot.currentPlan) !== JSON.stringify(previewExampleSnapshot())) throw new AgentRunError("AGENT_PREVIEW_SYNTHETIC_CONTEXT_REQUIRED");
  const session = input.session as Parameters<typeof planningActorFromSession>[0];
  return issuePreviewAccess({ actor: input.actor, planningActor: planningActorFromSession(session), snapshot, rotationProfile, baseRevision: PREVIEW_EXAMPLE_REVISION,
    body: { layout: previewExample().calculationContext.layout, boxSource: "sample", fiammetta_enable: false }, ip: input.ip, execute });
}
