import "server-only";
import { agentFeatureConfig } from "./feature-config.ts";
import { providerProfile } from "./provider-data-policy.ts";
import { businessEgressBlock, operatorBlock, authorizeBusinessEgress, type DeploymentApproval } from "./business-egress.ts";
import { agentConsentStore } from "./processing-consent-store.ts";
import { consentBinding, consentState, type AgentConsentStore } from "./processing-consent.ts";
export function deploymentApproval(env: Readonly<Record<string, string | undefined>> = process.env): DeploymentApproval {
  return { enabled: agentFeatureConfig(env).enabled, businessEnabled: env.AGENT_EXTERNAL_BUSINESS_EGRESS_ENABLED === "1",
    profile: providerProfile(env.AGENT_PROVIDER_PROFILE_ID), endpoint: env.AGENT_MODEL_BASE_URL, protocol: env.AGENT_MODEL_PROTOCOL,
    profileVersion: env.AGENT_PROVIDER_PROFILE_VERSION, privacyVersion: env.AGENT_PRIVACY_VERSION, policyVersion: env.AGENT_DATA_EGRESS_POLICY_VERSION };
}
export type ProcessingStatus = {
  state: "disabled" | "fake_test" | "external_unavailable" | "consent_required" | "consent_outdated" | "consent_revoked" | "ready";
  provider: { displayName: string; links: readonly string[] } | null;
  binding: ReturnType<typeof consentBinding> | null;
};
export function createProcessingAccess(config = agentFeatureConfig, deployment = deploymentApproval, store: AgentConsentStore = agentConsentStore) {
  return {
    store, deployment,
    async status(userId: string): Promise<ProcessingStatus> {
      const flags = config(); const approval = deployment();
      const provider = approval.profile ? { displayName: approval.profile.displayName, links: approval.profile.links } : null;
      if (!flags.enabled) return { state: "disabled", provider: null, binding: null };
      if (flags.fakeAllowed) return { state: "fake_test", provider: null, binding: null };
      if (operatorBlock(approval)) return { state: "external_unavailable", provider, binding: null };
      const binding = consentBinding(approval.profile!); const state = consentState(await store.get(userId), userId, binding);
      return { state: state === "current" ? "ready" : state === "required" ? "consent_required" : state === "revoked" ? "consent_revoked" : "consent_outdated", provider, binding };
    },
    async authorize(userId: string) {
      const approval = deployment();
      if (operatorBlock(approval)) return null; // no DB, credentials, services or provider construction on blocked deployment
      return authorizeBusinessEgress(approval, userId, await store.get(userId), async () => {
        const current = deployment();
        return !businessEgressBlock(current, userId, await store.get(userId))
          && current.endpoint === approval.endpoint && current.protocol === approval.protocol
          && current.profile?.providerProfileId === approval.profile?.providerProfileId && current.profileVersion === approval.profileVersion;
      });
    },
  };
}
export const processingAccess = createProcessingAccess();
