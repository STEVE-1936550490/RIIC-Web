/** Reviewed server catalog. Protocol compatibility and a configured URL are never approval. */
export const DATA_EGRESS_POLICY_VERSION = "2026-09-08-m0-minimized-v1";
export const AGENT_CONSENT_VERSION = "2026-09-08-external-model-v1";
export type ProcessingFact = Readonly<{ status: "VERIFIED" | "UNKNOWN" | "NOT_APPLICABLE"; detail: string; evidence: readonly string[] }>;
export type ProviderDataProfile = Readonly<{
  providerProfileId: string; displayName: string; version: string;
  protocols: readonly ("responses" | "chat_completions")[]; endpointIdentity: string;
  evidenceCheckedAt: string; links: readonly string[];
  retention: ProcessingFact; training: ProcessingFact; terms: ProcessingFact;
  monitoring: ProcessingFact; region: ProcessingFact; subprocessors: ProcessingFact; deletion: ProcessingFact;
  businessContextReleaseStatus: "APPROVED" | "BLOCKED_UNVERIFIED_PROCESSING";
}>;
const unknown: ProcessingFact = Object.freeze({ status: "UNKNOWN", detail: "No sufficient official API processing evidence verified in this review.", evidence: Object.freeze([]) });
export const PROVIDER_DATA_PROFILES: readonly ProviderDataProfile[] = Object.freeze([Object.freeze({
  providerProfileId: "china-mobile-cloud-moma", displayName: "中国移动云 MoMA / China Mobile Cloud MoMA", version: "2026-09-08-unverified-v1",
  protocols: Object.freeze(["chat_completions", "responses"] as const), endpointIdentity: "https://moma.cmecloud.cn/v1",
  evidenceCheckedAt: "2026-09-08", links: Object.freeze(["https://moma.cmecloud.cn/"]),
  retention: unknown, training: unknown, terms: unknown, monitoring: unknown, region: unknown, subprocessors: unknown, deletion: unknown,
  businessContextReleaseStatus: "BLOCKED_UNVERIFIED_PROCESSING",
})]);
export function providerProfile(id: string | undefined) { return PROVIDER_DATA_PROFILES.find((profile) => profile.providerProfileId === id); }
export function processingApproved(profile: ProviderDataProfile): boolean {
  return profile.businessContextReleaseStatus === "APPROVED" && [profile.retention, profile.training, profile.terms].every((fact) => fact.status === "VERIFIED" && fact.evidence.length > 0);
}
