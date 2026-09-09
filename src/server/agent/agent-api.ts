import { processingAccess } from "./processing-access.ts";
import { createCompatibleLoopProviderFromEnv } from "./compatible-provider.ts";
import { assertBusinessText } from "./model-payload-boundary.ts";
import "server-only";
import { assertSameOrigin, createRequestId, enforceRateLimit, failureResponse, PublicApiError, readJsonBody, requestClientIp, successResponse } from "../api-contract.ts";
import { requireWebsiteSession } from "../auth/authorization.ts";
import { createAccountSavedPlanReadService, createAccountSavedPlanComparisonReadService } from "../saved-plan-read-server.ts";
import { actorFromWebsiteSession, validatedSnapshot } from "./execution-context.ts";
import { agentFeatureConfig } from "./feature-config.ts";
import { runReadOnlyAgent } from "./orchestrator.ts";
import { LocalDemoProvider } from "./fake-loop-provider.ts";
import { AgentRunError, exact, text } from "./run-contract.ts";
import type { LoopProvider } from "./loop-provider.ts";

// Injection is server/test-only; HTTP cannot select dependencies, provider, actor or classification.
export const agentApiDependencies = {
  access: processingAccess, externalProvider: createCompatibleLoopProviderFromEnv,
  session: requireWebsiteSession, config: agentFeatureConfig,
  services: () => ({ savedPlans: createAccountSavedPlanReadService(), comparison: createAccountSavedPlanComparisonReadService() }),
  provider: (): LoopProvider => new LocalDemoProvider(),
};
export async function handleAgentRequest(request: Request, dependencies: Omit<typeof agentApiDependencies, "session"> & { session(request: Request): Promise<unknown> } = agentApiDependencies) {
  const requestId = createRequestId(); const startedAt = performance.now();
  const noStore = (response: Response) => { response.headers.set("Cache-Control", "no-store"); return response; };
  try {
    const config = dependencies.config();
    if (request.method === "GET") return noStore(successResponse({ enabled: config.enabled, modelMode: config.fakeAllowed ? "fake_test" : "blocked" }, requestId));
    if (!config.enabled) throw new PublicApiError("AIC-AUTH-2007");
    assertSameOrigin(request);
    enforceRateLimit("agent-ip", requestClientIp(request), 20, 60_000);
    const session = await dependencies.session(request);
    const actor = actorFromWebsiteSession(session, requestId);
    enforceRateLimit("agent-actor", actor.userId, 6, 60_000);
    const body = exact(await readJsonBody(request, 40 * 1024), ["message", "context"]);
    const message = text(body.message, 2000); const snapshot = validatedSnapshot(body.context);
    // Everything received on this route is business context, even client-claimed synthetic data.
    // Key presence has no effect: do not construct an external client or read services when blocked.
    const egress = config.fakeAllowed ? { classification: "user_business_context" as const, localTestApproved: true } : await dependencies.access.authorize(actor.userId);
    if (!egress) return noStore(successResponse({ status: "failed", error: "AGENT_MODEL_EGRESS_BLOCKED", contextRevision: snapshot?.contextRevision ?? null,
      runId: createRequestId(), answer: "External model access to business context is blocked by privacy policy.", intent: null, modelMode: "external",
      sources: [], tools: [], limitations: ["BLOCKED_PRIVACY"], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }, requestId));
    if (!config.fakeAllowed) assertBusinessText(message);
    const result = await runReadOnlyAgent({ message, context: { actor, snapshot, ...dependencies.services() }, provider: config.fakeAllowed ? dependencies.provider() : dependencies.externalProvider(),
      egress, signal: request.signal });
    return noStore(successResponse(result, requestId));
  } catch (error) {
    // Never pass raw parse/session/provider errors, request bodies, or causes to diagnostic logging.
    const safe = error instanceof PublicApiError ? new PublicApiError(error.code) : new PublicApiError("AIC-REQ-1001");
    if (error instanceof AgentRunError && error.code === "AGENT_INVALID_CONTEXT") safe.message = "Agent context is invalid.";
    return noStore(failureResponse(safe, requestId, "/api/agent", startedAt));
  }
}
