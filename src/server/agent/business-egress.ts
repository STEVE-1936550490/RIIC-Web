import { PRIVACY_VERSION } from "../../legal-policy.ts";
import { DATA_EGRESS_POLICY_VERSION, processingApproved, type ProviderDataProfile } from "./provider-data-policy.ts";
import { consentBinding, consentState, type AgentProcessingConsent } from "./processing-consent.ts";
import type { EgressContext } from "./egress-policy.ts";
import { AgentRunError } from "./run-contract.ts";
export type EgressBlock = "BUSINESS_EGRESS_DISABLED" | "PROVIDER_NOT_APPROVED" | "PROVIDER_PROFILE_MISMATCH" | "CONSENT_REQUIRED" | "CONSENT_OUTDATED" | "CONSENT_REVOKED" | "PAYLOAD_CLASSIFICATION_FAILED" | "PROHIBITED_FIELD" | "POLICY_VERSION_MISMATCH";
export type DeploymentApproval = {
  enabled: boolean; businessEnabled: boolean; profile?: ProviderDataProfile;
  endpoint: string | undefined; protocol: string | undefined; profileVersion: string | undefined;
  privacyVersion: string | undefined; policyVersion: string | undefined;
};
export function operatorBlock(input: DeploymentApproval): EgressBlock | null {
  if (!input.enabled || !input.businessEnabled) return "BUSINESS_EGRESS_DISABLED";
  if (!input.profile || !processingApproved(input.profile)) return "PROVIDER_NOT_APPROVED";
  if (input.endpoint !== input.profile.endpointIdentity || !input.profile.protocols.some((p) => p === input.protocol) || input.profileVersion !== input.profile.version) return "PROVIDER_PROFILE_MISMATCH";
  if (input.privacyVersion !== PRIVACY_VERSION || input.policyVersion !== DATA_EGRESS_POLICY_VERSION) return "POLICY_VERSION_MISMATCH";
  return null;
}
export function businessEgressBlock(input: DeploymentApproval, userId: string, consent: AgentProcessingConsent | null): EgressBlock | null {
  const blocked = operatorBlock(input); if (blocked) return blocked;
  const state = consentState(consent, userId, consentBinding(input.profile!));
  return state === "current" ? null : state === "required" ? "CONSENT_REQUIRED" : state === "revoked" ? "CONSENT_REVOKED" : "CONSENT_OUTDATED";
}
// An HTTP object or environment flag cannot forge this process-local, run-bound capability.
const capabilities = new WeakMap<EgressContext, { endpoint: string; protocol: string; userId: string; runId?: string; recheck: () => Promise<boolean> }>();
export async function authorizeBusinessEgress(input: DeploymentApproval, userId: string, consent: AgentProcessingConsent | null, recheck: () => Promise<boolean>): Promise<EgressContext | null> {
  if (businessEgressBlock(input, userId, consent)) return null;
  const context: EgressContext = Object.freeze({ classification: "user_business_context", localTestApproved: false });
  capabilities.set(context, { endpoint: input.endpoint!, protocol: input.protocol!, userId, recheck }); return context;
}
export function issuedBusinessEgress(context: EgressContext): boolean { return capabilities.has(context); }
export function bindBusinessRun(context: EgressContext, userId: string, runId: string): void {
  const cap = capabilities.get(context);
  if (!cap || cap.userId !== userId || (cap.runId !== undefined && cap.runId !== runId)) throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
  cap.runId = runId;
}
const payloads = new WeakMap<object, string>();
export function markModelPayload(payload: object) { payloads.set(payload, JSON.stringify(payload)); }
export async function assertBusinessRunSend(context: EgressContext, payload: { runId?: string }): Promise<void> {
  const cap = capabilities.get(context);
  if (!cap || !cap.runId || cap.runId !== payload.runId || payloads.get(payload) !== JSON.stringify(payload)) throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
  const allowed = await cap.recheck();
  if (!allowed || payloads.get(payload) !== JSON.stringify(payload)) throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
}
export async function assertBusinessSend(context: EgressContext, payload: { runId?: string }, binding?: { baseURL: string; protocol: string }): Promise<void> {
  if (context.classification === "synthetic") return;
  const cap = capabilities.get(context);
  if (!cap || !binding || cap.endpoint !== binding.baseURL || cap.protocol !== binding.protocol || !cap.runId || cap.runId !== payload.runId
    || payloads.get(payload) !== JSON.stringify(payload)) throw new AgentRunError("AGENT_MODEL_EGRESS_BLOCKED");
  await assertBusinessRunSend(context, payload);
}
