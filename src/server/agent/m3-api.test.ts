import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticExecution, call, final } from "./m3-test-support.ts";
const { handleAgentRequest, agentApiDependencies } = await import("./agent-api.ts");
const { PublicApiError } = await import("../api-contract.ts");
const { ScriptedLoopProvider } = await import("./fake-loop-provider.ts");
// Isolate existing sanitized HTTP diagnostics from every real application data directory.
process.env.BETA_STORAGE_DIR = await mkdtemp(join(tmpdir(), "riic-agent-api-test-"));
function deps() {
  const ctx = syntheticExecution();
  return { ...agentApiDependencies, config: () => ({ enabled: true, fakeAllowed: true }),
    session: async () => ({ user: { id: "synthetic-owner" } }),
    services: () => ({ savedPlans: ctx.savedPlans, comparison: ctx.comparison }),
    provider: () => new ScriptedLoopProvider([call(), final]) };
}
const request = (body: unknown = { message: "summary", context: syntheticExecution().snapshot }, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request("http://localhost/api/agent", {
  method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
test("API fake/synthetic full path executes actual M2 tool and returns bounded envelope without actor", async () => {
  const response = await handleAgentRequest(request(), deps()); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.data.status, "ok"); assert.equal(body.data.tools[0].name, "current_plan.get_summary");
  assert.equal(body.data.sources[0].contextRevision, "synthetic-rev-1"); assert.equal(body.data.modelMode, "fake_test");
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(JSON.stringify(body).includes('"userId"'), false);
});
test("API auth/origin/body/flag checks fail closed with stable envelopes", async () => {
  const disabled = await handleAgentRequest(request(), { ...deps(), config: () => ({ enabled: false, fakeAllowed: false }) }); assert.equal(disabled.status, 404);
  const denied = await handleAgentRequest(request(), { ...deps(), session: async () => { throw new PublicApiError("AIC-AUTH-2008"); } }); assert.equal(denied.status, 401);
  assert.equal((await handleAgentRequest(request(undefined, { origin: "http://evil.test" }), deps())).status, 403);
  assert.equal((await handleAgentRequest(request(undefined, { "content-length": "50000" }), deps())).status, 413);
  assert.equal((await handleAgentRequest(request({ message: "x".repeat(50000), context: null }), deps())).status, 413);
  assert.equal((await handleAgentRequest(new Request("http://localhost/api/agent", { method: "POST", body: "{invalid" }), deps())).status, 400);
  for (const body of [null, [], "text", {}, { message: "summary", context: null, userId: "foreign" }, { message: "summary", context: null, provider: "fake" },
    { message: "summary", context: { currentPlan: {} } }, { message: "x".repeat(2001), context: null }]) assert.equal((await handleAgentRequest(request(body), deps())).status, 400);
});
test("API never lets browser classify synthetic or enable fake; blocked route cannot create provider/services", async () => {
  let constructed = false;
  const response = await handleAgentRequest(request(), { ...deps(), config: () => ({ enabled: true, fakeAllowed: false }),
    provider: () => { constructed = true; throw new Error(); }, services: () => { constructed = true; throw new Error(); } });
  const body = await response.json(); assert.equal(body.data.error, "AGENT_MODEL_EGRESS_BLOCKED"); assert.equal(constructed, false);
  const injection = await handleAgentRequest(request({ message: "summary", context: null, classification: "synthetic" }), deps()); assert.equal(injection.status, 400);
  for (const field of ["baseURL", "model", "apiKey", "synthetic", "skipPrivacy"]) {
    assert.equal((await handleAgentRequest(request({ message: "summary", context: null, [field]: "synthetic-value" }), deps())).status, 400);
  }
});
test("API abort reaches Loop and prevents model execution", async () => {
  const abort = new AbortController(); abort.abort(); let called = false;
  const response = await handleAgentRequest(request(undefined, {}, abort.signal), { ...deps(), provider: () => new ScriptedLoopProvider([async () => { called = true; return final; }]) });
  assert.equal((await response.json()).data.error, "AGENT_ABORTED"); assert.equal(called, false);
});
