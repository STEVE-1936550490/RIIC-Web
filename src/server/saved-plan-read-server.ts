import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDatabase } from "./db/index.ts";
import { savedPlan } from "./db/schema.ts";
import { requireAccountDataConsent } from "./data-consent.ts";
import { createSavedPlanReadService, visibleOwnedSavedPlanRows } from "./saved-plan-read-service.ts";
import { createSavedPlanComparisonReadService } from "./saved-plan-comparison-service.ts";

function visibility(userId: string, now: Date) {
  return and(eq(savedPlan.userId, userId), or(eq(savedPlan.pinned, true), isNull(savedPlan.expiresAt), gte(savedPlan.expiresAt, now)));
}

// Query builders are also exercised with drizzle.mock(): no real database in tests.
export function savedPlanMetadataQuery(database: ReturnType<typeof getDatabase>, userId: string, now: Date) {
  return database.select({
    id: savedPlan.id, userId: savedPlan.userId, title: savedPlan.title, diagnosticId: savedPlan.diagnosticId,
    pinned: savedPlan.pinned, createdAt: savedPlan.createdAt, updatedAt: savedPlan.updatedAt, expiresAt: savedPlan.expiresAt,
  }).from(savedPlan).where(visibility(userId, now)).orderBy(desc(savedPlan.pinned), desc(savedPlan.updatedAt), asc(savedPlan.id));
}

/** Shared by the ordinary API's workspace service; existing API maintenance remains outside this read. */
export async function readOwnedSavedPlanRows(userId: string, now: Date) {
  const rows = await getDatabase().select().from(savedPlan).where(visibility(userId, now))
    .orderBy(desc(savedPlan.pinned), desc(savedPlan.updatedAt), asc(savedPlan.id));
  return visibleOwnedSavedPlanRows(rows, userId, now);
}

/** Inject this service and an authenticated session actor on the server, never from tool arguments. */
export function createAccountSavedPlanReadService() {
  return createSavedPlanReadService({
    requireConsent: requireAccountDataConsent,
    loadMetadata: (userId, now) => savedPlanMetadataQuery(getDatabase(), userId, now),
    now: () => new Date(),
  });
}

export function savedPlanComparisonQuery(database: ReturnType<typeof getDatabase>, userId: string, ids: string[], now: Date) {
  return database.select({
    id: savedPlan.id, userId: savedPlan.userId, title: savedPlan.title, diagnosticId: savedPlan.diagnosticId,
    pinned: savedPlan.pinned, createdAt: savedPlan.createdAt, updatedAt: savedPlan.updatedAt, expiresAt: savedPlan.expiresAt,
    publicResult: savedPlan.publicResult, calculationContext: savedPlan.calculationContext,
  }).from(savedPlan).where(and(visibility(userId, now), inArray(savedPlan.id, ids))).orderBy(asc(savedPlan.id));
}

export function createAccountSavedPlanComparisonReadService() {
  return createSavedPlanComparisonReadService({
    metadata: createAccountSavedPlanReadService(),
    loadDetails: (userId, ids, now) => savedPlanComparisonQuery(getDatabase(), userId, ids, now),
    now: () => new Date(),
  });
}
