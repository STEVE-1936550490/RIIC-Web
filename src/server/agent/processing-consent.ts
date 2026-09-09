import { PRIVACY_VERSION } from "../../legal-policy.ts";
import { AGENT_CONSENT_VERSION, DATA_EGRESS_POLICY_VERSION, type ProviderDataProfile } from "./provider-data-policy.ts";
export type ConsentBinding = { consentVersion: string; privacyVersion: string; providerProfileId: string; providerProfileVersion: string; dataEgressPolicyVersion: string };
export type AgentProcessingConsent = ConsentBinding & { userId: string; grantedAt: Date; revokedAt: Date | null };
export interface AgentConsentStore {
  get(userId: string): Promise<AgentProcessingConsent | null>;
  grant(value: AgentProcessingConsent): Promise<void>;
  revoke(userId: string): Promise<void>;
}
export function consentBinding(profile: ProviderDataProfile): ConsentBinding {
  return { consentVersion: AGENT_CONSENT_VERSION, privacyVersion: PRIVACY_VERSION, providerProfileId: profile.providerProfileId, providerProfileVersion: profile.version, dataEgressPolicyVersion: DATA_EGRESS_POLICY_VERSION };
}
export function consentState(consent: AgentProcessingConsent | null, userId: string, binding: ConsentBinding): "current" | "required" | "outdated" | "revoked" {
  if (!consent || consent.userId !== userId) return "required";
  if (consent.revokedAt) return "revoked";
  if (Object.entries(binding).some(([key, value]) => consent[key as keyof ConsentBinding] !== value)) return "outdated";
  return "current";
}
