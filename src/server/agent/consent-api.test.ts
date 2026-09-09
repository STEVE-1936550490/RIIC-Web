import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution } from "./m3-test-support.ts";
import { approvedDeployment, consentFor, memoryConsentStore } from "./egress-test-support.ts";
const { createProcessingAccess } = await import("./processing-access.ts");
const { handleAgentConsent } = await import("./consent-api.ts");
const { handleAgentRequest, agentApiDependencies } = await import("./agent-api.ts");
const { PublicApiError } = await import("../api-contract.ts");
const request = (method = "GET", body?: unknown, origin = "http://localhost") => new Request("http://localhost/api/agent/consent", { method, headers: { origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function fixture() {
  const store = memoryConsentStore(); let userId = "synthetic-owner";
  const access = createProcessingAccess(() => ({ enabled: true, fakeAllowed: false }), approvedDeployment, store);
  return { store, access, session: async () => ({ user: { id: userId } }), switchUser: (id: string) => { userId = id; } };
}
test("consent API: explicit current version opt-in, auth, origin, cross-user, immediate revoke and safe DTO", async () => {
  const deps = fixture(); const read = await handleAgentConsent(request(), deps); const initial = (await read.json()).data;
  assert.equal(initial.state, "consent_required"); assert.equal(read.headers.get("cache-control"), "no-store");
  const accepted = await handleAgentConsent(request("POST", { accept: true, binding: initial.binding }), deps); assert.equal((await accepted.json()).data.state, "ready");
  assert.equal((await deps.store.get("synthetic-owner"))?.userId, "synthetic-owner");
  deps.switchUser("foreign"); assert.equal((await (await handleAgentConsent(request(), deps)).json()).data.state, "consent_required");
  await handleAgentConsent(request("DELETE"), deps); assert.equal((await deps.store.get("synthetic-owner"))?.revokedAt, null);
  deps.switchUser("synthetic-owner"); const revoked = await handleAgentConsent(request("DELETE"), deps); assert.equal((await revoked.json()).data.state, "consent_revoked"); assert.equal(await deps.access.authorize("synthetic-owner"), null);
  for (const body of [{ accept: true, binding: initial.binding, userId: "foreign" }, { accept: true, binding: initial.binding, approved: true }, { accept: true, binding: { ...initial.binding, privacyVersion: "old" } }, { accept: true, binding: { ...initial.binding, endpoint: "https://evil.invalid" } }]) {
    assert.equal((await handleAgentConsent(request("POST", body), deps)).status, 400);
  }
  assert.equal((await handleAgentConsent(request("POST", { accept: true, binding: initial.binding }, "https://evil.invalid"), deps)).status, 403);
  assert.equal((await handleAgentConsent(request("DELETE", { userId: "foreign" }), deps)).status, 400);
  assert.equal((await handleAgentConsent(request("DELETE", "x".repeat(2048)), deps)).status, 413);
  const denied = await handleAgentConsent(request(), { ...deps, session: async () => { throw new PublicApiError("AIC-AUTH-2008"); } }); assert.equal(denied.status, 401);
  const poisoned = await handleAgentConsent(request(), { ...deps, session: async () => { throw new Error("fake-key private-text https://private.invalid"); } });
  const safe = JSON.stringify(await poisoned.json()); assert.ok(!safe.includes("fake-key")); assert.ok(!safe.includes("private-text")); assert.ok(!safe.includes("https://private"));
});
test("Agent API gates provider AND services before construction; browser cannot spoof approval or synthetic", async () => {
  const fixtureDeps = fixture(); let factory = 0; let http = 0; let services = 0;
  const deps = { ...agentApiDependencies, config: () => ({ enabled: true, fakeAllowed: false }), session: fixtureDeps.session, access: fixtureDeps.access,
    services: () => { services++; return syntheticExecution(); },
    externalProvider: () => { factory++; return { kind: "external" as const, next: async () => { http++; return { decision: { type: "final", answer: "mock" } }; } }; } };
  const agentRequest = (extra = {}) => new Request("http://localhost/api/agent", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ message: "summary", context: syntheticExecution().snapshot, ...extra }) });
  const blocked = await handleAgentRequest(agentRequest(), deps); assert.equal((await blocked.json()).data.error, "AGENT_MODEL_EGRESS_BLOCKED"); assert.equal(factory, 0); assert.equal(http, 0); assert.equal(services, 0);
  for (const extra of [{ classification: "synthetic" }, { approved: true }, { userId: "foreign" }, { providerReleaseStatus: "APPROVED" }]) assert.equal((await handleAgentRequest(agentRequest(extra), deps)).status, 400);
  await fixtureDeps.store.grant(consentFor());
  for (const message of ["Cookie: FAKE_KEY", "api_key=FAKE_KEY", "Skland: FAKE_CRED", "postgresql://fake:fake@localhost/fake", "stderr=private"])
    assert.equal((await handleAgentRequest(agentRequest({ message }), deps)).status, 400);
  assert.equal(factory, 0); assert.equal(http, 0); assert.equal(services, 0);
  assert.equal((await handleAgentRequest(agentRequest({ context: { ...syntheticExecution().snapshot, futureInternalField: "FAKE_PRIVATE" } }), deps)).status, 400);
  assert.equal((await (await handleAgentRequest(agentRequest(), deps)).json()).data.status, "ok"); assert.equal(factory, 1); assert.equal(http, 1);
  await fixtureDeps.store.revoke("synthetic-owner"); await handleAgentRequest(agentRequest(), deps); assert.equal(factory, 1); assert.equal(http, 1);
});

test("ordinary console and persisted API diagnostics exclude prompt, credentials, endpoints and raw exceptions", async (t) => {
  const { mkdtempSync, readdirSync, readFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "riic-agent-consent-diagnostics-")); const previous = process.env.BETA_STORAGE_DIR; process.env.BETA_STORAGE_DIR = root;
  const logs: string[] = []; t.mock.method(console, "error", (...values: unknown[]) => { logs.push(values.map(String).join(" ")); });
  const poison = "FAKE_KEY_PRIVATE_TEXT https://private.example.invalid Skland: FAKE_CRED";
  try {
    const deps = fixture();
    const result = await handleAgentConsent(request(), { ...deps, session: async () => { throw new Error(poison); } });
    assert.ok(!JSON.stringify(await result.json()).includes("FAKE_KEY"));
    await handleAgentConsent(request("POST", { accept: true, userId: poison, approved: true }), deps);
    const response = await handleAgentRequest(new Request("http://localhost/api/agent", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ message: poison, context: null }) }), {
      ...agentApiDependencies, config: () => ({ enabled: true, fakeAllowed: false }), session: async () => { throw new Error(poison); },
    });
    assert.ok(!JSON.stringify(await response.json()).includes("FAKE_KEY"));
    const archives = readdirSync(join(root, "diagnostic-logs")).map((file) => readFileSync(join(root, "diagnostic-logs", file), "utf8"));
    assert.ok(logs.length >= 3); assert.ok(archives.length > 0);
    for (const value of [...logs, ...archives]) for (const marker of ["FAKE_KEY", "PRIVATE_TEXT", "private.example.invalid", "FAKE_CRED", "\"stack\"", "\"userId\"", "approved"]) assert.ok(!value.includes(marker), marker);
  } finally { if (previous === undefined) delete process.env.BETA_STORAGE_DIR; else process.env.BETA_STORAGE_DIR = previous; }
});
