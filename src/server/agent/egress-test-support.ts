// Offline fixtures only. This approved profile is never part of the runtime catalog.
import { PRIVACY_VERSION } from "../../legal-policy.ts";
import { DATA_EGRESS_POLICY_VERSION, type ProviderDataProfile } from "./provider-data-policy.ts";
import { consentBinding, type AgentConsentStore, type AgentProcessingConsent } from "./processing-consent.ts";
import type { DeploymentApproval } from "./business-egress.ts";
const verified = { status: "VERIFIED" as const, detail: "Synthetic test evidence only", evidence: ["https://provider.example.invalid/policy"] };
export const approvedTestProfile: ProviderDataProfile = {
  providerProfileId: "synthetic-provider", displayName: "Synthetic Provider", version: "synthetic-v1", endpointIdentity: "https://provider.example.invalid/v1",
  protocols: ["responses", "chat_completions"], evidenceCheckedAt: "2026-09-08", links: verified.evidence,
  retention: verified, training: verified, terms: verified, monitoring: verified, region: verified, subprocessors: verified, deletion: verified,
  businessContextReleaseStatus: "APPROVED",
};
export function approvedDeployment(): DeploymentApproval {
  return { enabled: true, businessEnabled: true, profile: approvedTestProfile, endpoint: approvedTestProfile.endpointIdentity, protocol: "chat_completions",
    profileVersion: approvedTestProfile.version, privacyVersion: PRIVACY_VERSION, policyVersion: DATA_EGRESS_POLICY_VERSION };
}
export function consentFor(userId = "synthetic-owner"): AgentProcessingConsent {
  return { userId, ...consentBinding(approvedTestProfile), grantedAt: new Date("2026-09-08T00:00:00Z"), revokedAt: null };
}
export function memoryConsentStore(): AgentConsentStore {
  const rows = new Map<string, AgentProcessingConsent>();
  return { async get(id) { return structuredClone(rows.get(id) ?? null); }, async grant(value) { rows.set(value.userId, structuredClone(value)); },
    async revoke(id) { const row = rows.get(id); if (row) rows.set(id, { ...row, revokedAt: new Date() }); } };
}
