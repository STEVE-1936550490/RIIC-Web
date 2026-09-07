import {
  compareSavedPlanMetadata, parseSavedPlanActor, parseSavedPlanMetadata, SavedPlanReadError,
  type SavedPlanMetadata, type SavedPlanReadService,
} from "../../saved-plan-read-service.ts";

export const MAX_SAVED_PLAN_QUERY_LENGTH = 120;
export const MAX_SAVED_PLAN_LIST_ITEMS = 10;
export const MAX_SAVED_PLAN_LIST_BYTES = 8192;
export const SAVED_PLAN_LIST_TOOL = {
  name: "saved_plan.list", effect: "read",
  inputSchema: {
    type: "object", properties: { query: { anyOf: [{ type: "string", minLength: 1, maxLength: MAX_SAVED_PLAN_QUERY_LENGTH }, { type: "null" }] } },
    required: ["query"], additionalProperties: false,
  },
} as const;

export class SavedPlanToolInputError extends Error {
  readonly code = "AGENT_TOOL_INVALID_INPUT";
  constructor() { super("保存方案工具参数不符合严格输入契约。"); this.name = "SavedPlanToolInputError"; }
}

export function parseSavedPlanListInput(value: unknown): { query: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1
    || !Object.hasOwn(value, "query") || !("query" in value)
    || value.query !== null && (typeof value.query !== "string" || !value.query.trim() || [...value.query].length > MAX_SAVED_PLAN_QUERY_LENGTH)) {
    throw new SavedPlanToolInputError();
  }
  return { query: value.query === null ? null : value.query.trim() };
}

export type SavedPlanToolExecutionContext = { actor: unknown; service: SavedPlanReadService };
type SavedPlanListBase = { source: { type: "saved_plans" }; truncation: { applied: boolean; omittedCount: number } };
export type SavedPlanListResult = SavedPlanListBase & (
  | { status: "ok" | "empty"; plans: SavedPlanMetadata[] }
  | { status: "unavailable"; issue: { code: SavedPlanReadError["code"] } }
);

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/gu, " ").replace(/[A-Z]/g, (char) => char.toLowerCase());
}

export async function executeSavedPlanList(input: unknown, context: SavedPlanToolExecutionContext): Promise<SavedPlanListResult> {
  const args = parseSavedPlanListInput(input);
  const base: SavedPlanListBase = { source: { type: "saved_plans" }, truncation: { applied: false, omittedCount: 0 } };
  try {
    const actor = parseSavedPlanActor(context.actor);
    const raw: unknown = await context.service.list(actor);
    if (!Array.isArray(raw) || raw.length > 1000) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
    const all = Array.from(raw).map(parseSavedPlanMetadata).filter((plan) => args.query === null
      || normalizedTitle(plan.title).includes(normalizedTitle(args.query))).sort(compareSavedPlanMetadata);
    if (new Set(all.map((plan) => plan.id)).size !== all.length) throw new SavedPlanReadError("SAVED_PLAN_DATA_UNAVAILABLE");
    const result: SavedPlanListResult = { ...base, status: all.length ? "ok" : "empty", plans: all.slice(0, MAX_SAVED_PLAN_LIST_ITEMS) };
    result.truncation.omittedCount = all.length - result.plans.length;
    while (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_SAVED_PLAN_LIST_BYTES) {
      result.plans.pop(); result.truncation.omittedCount++;
    }
    result.truncation.applied = result.truncation.omittedCount > 0;
    return result;
  } catch (error) {
    return { ...base, status: "unavailable", issue: { code: error instanceof SavedPlanReadError ? error.code : "SAVED_PLAN_DATA_UNAVAILABLE" } };
  }
}
