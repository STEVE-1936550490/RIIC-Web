import {
  parseSavedPlanActor, parseSavedPlanMetadata, savedPlanId, savedPlanRecord, SavedPlanReadError,
  type SavedPlanMetadata, type SavedPlanReadService, type OwnedSavedPlanRow, type SavedPlanMetadataRow,
} from "./saved-plan-read-service.ts";
import { projectSavedPlanComparison, type SavedPlanComparisonProjection } from "./saved-plan-comparison-projection.ts";

export type SavedPlanComparisonRecord = { metadata: SavedPlanMetadata; projection: SavedPlanComparisonProjection };
export type SavedPlanComparisonReadResult =
  | { status: "missing" }
  | { status: "available"; left: SavedPlanComparisonRecord; right: SavedPlanComparisonRecord };
export type SavedPlanComparisonReadService = {
  readPair(actor: unknown, leftPlanId: string, rightPlanId: string): Promise<SavedPlanComparisonReadResult>;
};
export type SavedPlanComparisonRow = OwnedSavedPlanRow & SavedPlanMetadataRow & { publicResult: unknown; calculationContext: unknown };

export function createSavedPlanComparisonReadService(dependencies: {
  metadata: SavedPlanReadService;
  loadDetails(userId: string, ids: string[], now: Date): Promise<SavedPlanComparisonRow[]>;
  now(): Date;
}): SavedPlanComparisonReadService {
  return {
    async readPair(actorInput, leftInput, rightInput) {
      const actor = parseSavedPlanActor(actorInput);
      const ids = [...new Set([savedPlanId(leftInput), savedPlanId(rightInput)])];
      // Same consent/ownership/retention gate as list. Missing and foreign IDs are indistinguishable.
      const metadata = await dependencies.metadata.list(actor);
      if (ids.some((id) => !metadata.some((plan) => plan.id === id))) return { status: "missing" };
      try {
        const rows = await dependencies.loadDetails(actor.userId, ids, dependencies.now());
        const records = new Map<string, SavedPlanComparisonRecord>();
        for (const id of ids) {
          const matches = rows.filter((row) => row.id === id && row.userId === actor.userId);
          if (!matches.length) return { status: "missing" };
          if (matches.length !== 1) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
          const row = matches[0];
          const safeMetadata = parseSavedPlanMetadata(row);
          const listed = metadata.find((plan) => plan.id === id);
          if (safeMetadata.updatedAt !== listed?.updatedAt) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
          if (new TextEncoder().encode(JSON.stringify(row.publicResult)).byteLength > 1024 * 1024) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
          const rawResult = savedPlanRecord(row.publicResult);
          if (rawResult.diagnosticId !== safeMetadata.diagnosticId) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
          records.set(id, { metadata: safeMetadata, projection: projectSavedPlanComparison(row.publicResult, row.calculationContext) });
        }
        const left = records.get(leftInput);
        const right = records.get(rightInput);
        if (!left || !right) return { status: "missing" };
        return { status: "available", left, right };
      } catch { throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE"); }
    },
  };
}
