import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress } from "./m3-test-support.ts";
import { approvedDeployment, approvedTestProfile, consentFor, memoryConsentStore } from "./egress-test-support.ts";
import { authorizeBusinessEgress, businessEgressBlock, bindBusinessRun, assertBusinessSend } from "./business-egress.ts";
import { assertModelEgress } from "./egress-policy.ts";
import { PROVIDER_DATA_PROFILES } from "./provider-data-policy.ts";
const { createModelPayloadBoundary } = await import("./model-payload-boundary.ts");
const { visibleTools } = await import("./tool-registry.ts");
const { createProcessingAccess, deploymentApproval } = await import("./processing-access.ts");
const approval = approvedDeployment(); const consent = consentFor();
for (const [name, deployment, record, expected] of [
  ["kill off", { ...approval, businessEnabled: false }, consent, "BUSINESS_EGRESS_DISABLED"],
  ["feature off", { ...approval, enabled: false }, consent, "BUSINESS_EGRESS_DISABLED"],
  ["unapproved", { ...approval, profile: PROVIDER_DATA_PROFILES[0] }, consent, "PROVIDER_NOT_APPROVED"],
  ["unknown training", { ...approval, profile: { ...approvedTestProfile, training: { ...approvedTestProfile.training, status: "UNKNOWN" } } }, consent, "PROVIDER_NOT_APPROVED"],
  ["wrong endpoint", { ...approval, endpoint: "http://127.0.0.1/v1" }, consent, "PROVIDER_PROFILE_MISMATCH"],
  ["wrong protocol", { ...approval, protocol: "auto" }, consent, "PROVIDER_PROFILE_MISMATCH"],
  ["wrong profile version", { ...approval, profileVersion: "old" }, consent, "PROVIDER_PROFILE_MISMATCH"],
  ["operator policy", { ...approval, policyVersion: "old" }, consent, "POLICY_VERSION_MISMATCH"],
  ["operator privacy", { ...approval, privacyVersion: "old" }, consent, "POLICY_VERSION_MISMATCH"],
  ["no consent", approval, null, "CONSENT_REQUIRED"],
  ["other user", approval, consentFor("foreign"), "CONSENT_REQUIRED"],
  ["old privacy", approval, { ...consent, privacyVersion: "old" }, "CONSENT_OUTDATED"],
  ["old provider", approval, { ...consent, providerProfileVersion: "old" }, "CONSENT_OUTDATED"],
  ["old purpose", approval, { ...consent, dataEgressPolicyVersion: "old" }, "CONSENT_OUTDATED"],
  ["different provider", approval, { ...consent, providerProfileId: "other" }, "CONSENT_OUTDATED"],
  ["revoked", approval, { ...consent, revokedAt: new Date() }, "CONSENT_REVOKED"],
] as const) test(`business release gate: ${name}`, async () => {
  assert.equal(businessEgressBlock(deployment, consent.userId, record), expected);
  assert.equal(await authorizeBusinessEgress(deployment, consent.userId, record, async () => true), null);
});
test("configured known or private endpoint and bypass flags cannot approve a provider", () => {
  for (const endpoint of ["https://moma.cmecloud.cn/v1", "https://private.example.invalid/v1", "http://127.0.0.1/v1"]) {
    const settings = deploymentApproval({ AGENT_FEATURE_ENABLED: "1", AGENT_EXTERNAL_BUSINESS_EGRESS_ENABLED: "1", AGENT_PROVIDER_PROFILE_ID: "china-mobile-cloud-moma",
      AGENT_MODEL_BASE_URL: endpoint, ALLOW_ANY_PROVIDER: "1", SKIP_CONSENT: "1", TRUST_PRIVATE_GATEWAY: "1" });
    assert.equal(businessEgressBlock(settings, consent.userId, consent), "PROVIDER_NOT_APPROVED");
  }
});
test("opaque permit binds user, run, endpoint and protocol; rechecks revoke and rejects forged/mutated payload", async () => {
  let current = true;
  const egress = (await authorizeBusinessEgress(approval, consent.userId, consent, async () => current))!;
  assertModelEgress("external", egress);
  assert.throws(() => assertModelEgress("external", { ...egress }));
  assert.throws(() => bindBusinessRun(egress, "foreign", "run"));
  bindBusinessRun(egress, consent.userId, "run");
  assert.throws(() => bindBusinessRun(egress, consent.userId, "another"));
  const payload = createModelPayloadBoundary().request({ runId: "run", message: "summary", observations: [], tools: visibleTools(syntheticExecution()), egress, signal: new AbortController().signal });
  const binding = { baseURL: approval.endpoint!, protocol: approval.protocol! };
  await assertBusinessSend(egress, payload, binding);
  await assert.rejects(assertBusinessSend(egress, payload, { ...binding, baseURL: "https://other.example.invalid/v1" }));
  await assert.rejects(assertBusinessSend(egress, { ...payload }, binding));
  current = false; await assert.rejects(assertBusinessSend(egress, payload, binding));
  current = true; payload.message = "changed"; await assert.rejects(assertBusinessSend(egress, payload, binding));
  assertModelEgress("external", syntheticEgress); assertModelEgress("fake", { classification: "user_business_context", localTestApproved: true });
});
test("processing states: disabled and fake need no DB; revocation and version changes invalidate immediately", async () => {
  let deployment = approvedDeployment(); const store = memoryConsentStore();
  const access = createProcessingAccess(() => ({ enabled: true, fakeAllowed: false }), () => deployment, store);
  assert.equal((await access.status(consent.userId)).state, "consent_required");
  await store.grant(consent); assert.equal((await access.status(consent.userId)).state, "ready");
  const egress = await access.authorize(consent.userId); assert.ok(egress);
  deployment = { ...deployment, profile: { ...approvedTestProfile, version: "next" }, profileVersion: "next" };
  assert.equal((await access.status(consent.userId)).state, "consent_outdated");
  deployment = approvedDeployment(); await store.revoke(consent.userId);
  assert.equal((await access.status(consent.userId)).state, "consent_revoked"); assert.equal(await access.authorize(consent.userId), null);
  for (const [flags, expected] of [[{ enabled: false, fakeAllowed: false }, "disabled"], [{ enabled: true, fakeAllowed: true }, "fake_test"]] as const) {
    assert.equal((await createProcessingAccess(() => flags, () => deployment, { ...store, get: async () => { throw new Error("must not read"); } }).status(consent.userId)).state, expected);
  }
});
