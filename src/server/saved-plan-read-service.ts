import { SAVED_PLAN_LIMIT } from "./business-config.ts";

export type SavedPlanActor = { userId: string };
export type SavedPlanMetadata = {
  id: string;
  title: string;
  diagnosticId: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export class SavedPlanReadError extends Error {
  readonly code: "SAVED_PLAN_ACTOR_REQUIRED" | "SAVED_PLAN_ACCESS_UNAVAILABLE" | "SAVED_PLAN_DATA_UNAVAILABLE";
  constructor(code: SavedPlanReadError["code"]) {
    super(code);
    this.name = "SavedPlanReadError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function savedPlanRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
  return value;
}

export function savedPlanText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum
    || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
  }
  return value;
}

export function savedPlanId(value: unknown): string {
  const id = savedPlanText(value, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
  return id;
}

export function parseSavedPlanActor(value: unknown): SavedPlanActor {
  try {
    const actor = savedPlanRecord(value);
    if (Object.keys(actor).length !== 1 || !Object.hasOwn(actor, "userId")) throw new Error();
    return { userId: savedPlanText(actor.userId, 128) };
  } catch {
    throw new SavedPlanReadError("SAVED_PLAN_ACTOR_REQUIRED");
  }
}

function timestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string" || text.length > 40 || !Number.isFinite(Date.parse(text))
    || new Date(text).toISOString() !== text) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
  return text;
}

/** Explicit projection, not a copy-and-delete operation. Raw columns never leave this boundary. */
export function parseSavedPlanMetadata(value: unknown): SavedPlanMetadata {
  const row = savedPlanRecord(value);
  if (typeof row.pinned !== "boolean") throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
  return {
    id: savedPlanId(row.id), title: savedPlanText(row.title, 120),
    diagnosticId: savedPlanText(row.diagnosticId, 80), pinned: row.pinned,
    createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt),
  };
}

export function compareSavedPlanMetadata(left: SavedPlanMetadata, right: SavedPlanMetadata): number {
  return Number(right.pinned) - Number(left.pinned)
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export type OwnedSavedPlanRow = {
  userId: string; id: string; pinned: boolean; updatedAt: Date; expiresAt: Date | null;
};

/** Read-only equivalent of the existing retention rule; never prune or rotate keys. */
export function visibleOwnedSavedPlanRows<T extends OwnedSavedPlanRow>(rows: readonly T[], userId: string, now: Date): T[] {
  let normalCount = 0;
  return rows.filter((row) => row.userId === userId
    && (row.pinned || row.expiresAt === null || row.expiresAt.getTime() >= now.getTime()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.getTime() - a.updatedAt.getTime()
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((row) => row.pinned || ++normalCount <= SAVED_PLAN_LIMIT);
}

export type SavedPlanReadService = {
  list(actor: unknown): Promise<SavedPlanMetadata[]>;
};

export function createSavedPlanReadService(dependencies: {
  requireConsent(userId: string): Promise<void>;
  loadMetadata(userId: string, now: Date): Promise<Array<OwnedSavedPlanRow & SavedPlanMetadataRow>>;
  now(): Date;
}): SavedPlanReadService {
  return {
    async list(actorInput) {
      const actor = parseSavedPlanActor(actorInput);
      try { await dependencies.requireConsent(actor.userId); }
      catch { throw new SavedPlanReadError("SAVED_PLAN_ACCESS_UNAVAILABLE"); }
      try {
        const now = dependencies.now();
        const rows = await dependencies.loadMetadata(actor.userId, now);
        return visibleOwnedSavedPlanRows(rows, actor.userId, now).map(parseSavedPlanMetadata);
      } catch { throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE"); }
    },
  };
}

export type SavedPlanMetadataRow = {
  title: string; diagnosticId: string; createdAt: Date;
};
