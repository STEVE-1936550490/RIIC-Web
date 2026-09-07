import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSavedPlanReadService, parseSavedPlanActor, SavedPlanReadError, visibleOwnedSavedPlanRows } from "./saved-plan-read-service.ts";

const now = new Date("2026-09-07T00:00:00.000Z");
function row(id: string, userId = "synthetic-a", pinned = false) {
  return { id, userId, pinned, title: "同名合成", diagnosticId: "synthetic-diagnostic", createdAt: now, updatedAt: now, expiresAt: null };
}

test("read service scopes metadata to actor, preserves duplicate titles and excludes private columns", async () => {
  let consent = "";
  const service = createSavedPlanReadService({
    requireConsent: async (id) => { consent = id; }, now: () => now,
    loadMetadata: async (id) => { assert.equal(id, consent); return [row("b"), row("a"), { ...row("foreign", "synthetic-b"), publicResult: { debug: "private" } }]; },
  });
  const result = await service.list({ userId: "synthetic-a" });
  assert.deepEqual(result.map((plan) => plan.id), ["a", "b"]);
  assert.equal(result[0].title, result[1].title);
  assert.deepEqual(Object.keys(result[0]).sort(), ["createdAt", "diagnosticId", "id", "pinned", "title", "updatedAt"]);
  assert.deepEqual(await service.list({ userId: "synthetic-empty" }), []);
});

test("retention filtering is read-only, pinned first, deterministic on ties, with five normal plans", () => {
  const rows = [...Array.from({ length: 7 }, (_, i) => row(`normal-${i}`)),
    { ...row("expired"), expiresAt: new Date(now.getTime() - 1) },
    { ...row("pin", "synthetic-a", true), expiresAt: new Date(0) }];
  const before = structuredClone(rows);
  const visible = visibleOwnedSavedPlanRows(rows, "synthetic-a", now);
  assert.deepEqual(visible.map((plan) => plan.id), ["pin", "normal-0", "normal-1", "normal-2", "normal-3", "normal-4"]);
  assert.deepEqual(rows, before);
  assert.deepEqual(visibleOwnedSavedPlanRows([...rows].reverse(), "synthetic-a", now), visible);
  assert.equal(visibleOwnedSavedPlanRows([{ ...row("boundary"), expiresAt: now }], "synthetic-a", now).length, 1);
});

test("missing actor and denied consent fail before loading, without exposing underlying messages", async () => {
  let reads = 0;
  const service = createSavedPlanReadService({
    requireConsent: async () => { throw new Error("synthetic-private"); }, now: () => now,
    loadMetadata: async () => { reads++; return []; },
  });
  for (const actor of [null, [], "synthetic-a", {}, { userId: "" }, { userId: "a", permissions: [] }]) {
    assert.throws(() => parseSavedPlanActor(actor), SavedPlanReadError);
    await assert.rejects(service.list(actor), { code: "SAVED_PLAN_ACTOR_REQUIRED" });
  }
  await assert.rejects(service.list({ userId: "synthetic-a" }), { code: "SAVED_PLAN_ACCESS_UNAVAILABLE", message: "SAVED_PLAN_ACCESS_UNAVAILABLE" });
  assert.equal(reads, 0);
});

test("ordinary API and Agent use the shared read service, without routing Agent through write maintenance", async () => {
  const workspace = await readFile(new URL("./workspace.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("./saved-plans-api.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("./saved-plan-read-server.ts", import.meta.url), "utf8");
  assert.match(workspace, /await readOwnedSavedPlanRows\(userId, now\)/);
  assert.match(api, /listSavedPlans\(session.user.id\)/);
  assert.match(adapter, /requireConsent: requireAccountDataConsent/);
  for (const forbidden of [".update(", ".delete(", ".insert(", "decryptSnapshot", "workspaceMasterKeys", "pruneUserHistory"]) assert.equal(adapter.includes(forbidden), false);
});
