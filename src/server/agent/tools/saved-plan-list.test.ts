import assert from "node:assert/strict";
import test from "node:test";
import { createSavedPlanReadService } from "../../saved-plan-read-service.ts";
import { executeSavedPlanList, parseSavedPlanListInput, SAVED_PLAN_LIST_TOOL, SavedPlanToolInputError } from "./saved-plan-list.ts";

const actor = { userId: "synthetic-user" };
const now = new Date("2026-09-07T00:00:00.000Z");
function row(id: string, title = "合成计划 ABC", userId = actor.userId) {
  return { id, title, userId, pinned: false, diagnosticId: "synthetic-diagnostic", createdAt: now, updatedAt: now, expiresAt: null,
    publicResult: { debug: "synthetic-private" }, calculationContext: {}, operboxContentHmac: "synthetic-private" };
}
function context(rows = [row("b"), row("a"), row("foreign", "其他用户计划", "synthetic-other")]) {
  return { actor, service: createSavedPlanReadService({ requireConsent: async () => {}, now: () => now, loadMetadata: async () => rows }) };
}

test("strict read-only query parser accepts null and trims strings", () => {
  assert.equal(SAVED_PLAN_LIST_TOOL.effect, "read");
  assert.equal(SAVED_PLAN_LIST_TOOL.inputSchema.additionalProperties, false);
  assert.deepEqual(parseSavedPlanListInput({ query: null }), { query: null });
  assert.deepEqual(parseSavedPlanListInput({ query: " abc " }), { query: "abc" });
});
for (const [label, input] of [
  ["null", null], ["array", []], ["string", "{}"], ["missing", {}], ["empty", { query: " " }],
  ["type", { query: 1 }], ["long", { query: "x".repeat(121) }],
  ...["userId", "tenantId", "limit", "sort", "sql", "permissions"].map((key) => [key, { query: null, [key]: "synthetic" }]),
] as const) test(`rejects ${label}`, async () => {
  await assert.rejects(executeSavedPlanList(input, context()), SavedPlanToolInputError);
});

test("returns only actor metadata, keeps same-title candidates, query is normalized substring", async () => {
  const result = await executeSavedPlanList({ query: null }, context());
  assert.equal(result.status, "ok"); assert.ok("plans" in result);
  assert.deepEqual(result.plans.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(await executeSavedPlanList({ query: "计划 abc" }, context()), result);
  for (const ctx of [context([]), context()]) {
    const empty = await executeSavedPlanList({ query: "其他用户计划" }, ctx);
    assert.equal(empty.status, "empty"); assert.ok("plans" in empty); assert.deepEqual(empty.plans, []);
  }
  assert.deepEqual(await executeSavedPlanList({ query: null }, context([row("a"), row("b")])), result);
});

test("actor is server-only and failures have no raw error or account identity", async () => {
  const missing = await executeSavedPlanList({ query: null }, { ...context(), actor: null });
  assert.equal(missing.status, "unavailable"); assert.ok("issue" in missing); assert.equal(missing.issue.code, "SAVED_PLAN_ACTOR_REQUIRED");
  const error = await executeSavedPlanList({ query: null }, { actor, service: { list: async () => { throw new Error("synthetic-private"); } } });
  assert.equal(JSON.stringify(error).includes("synthetic-private"), false);
});

test("DTO recursively excludes private fields and structurally truncates deterministic metadata", async () => {
  const plans = Array.from({ length: 16 }, (_, i) => ({ ...row(`plan-${String(i).padStart(2, "0")}`), pinned: true }));
  const ctx = context(plans);
  const result = await executeSavedPlanList({ query: null }, ctx);
  assert.ok("plans" in result); assert.equal(result.plans.length, 10);
  assert.deepEqual(result.truncation, { applied: true, omittedCount: 6 });
  const forbidden = /^(debug|cred|cookie|token|authorization|stdout|stderr|operbox|userId|accountUid|connectionString|rawResponse|publicResult|calculationContext|operboxContentHmac)$/i;
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.test(key), false); check(child); }
  }
  check(result);
  assert.equal(JSON.stringify(result).includes("synthetic-private"), false);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 8192);
  assert.deepEqual(await executeSavedPlanList({ query: null }, context([...plans].reverse())), result);
});
