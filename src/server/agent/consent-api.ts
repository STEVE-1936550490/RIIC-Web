import "server-only";
import { assertEmptyBody, assertSameOrigin, createRequestId, enforceRateLimit, failureResponse, PublicApiError, readJsonBody, successResponse } from "../api-contract.ts";
import { requireWebsiteSession } from "../auth/authorization.ts";
import { actorFromWebsiteSession } from "./execution-context.ts";
import { processingAccess } from "./processing-access.ts";
import { exact } from "./run-contract.ts";
export const consentApiDependencies = { session: requireWebsiteSession as (request: Request) => Promise<unknown>, access: processingAccess };
export async function handleAgentConsent(request: Request, dependencies = consentApiDependencies): Promise<Response> {
  const requestId = createRequestId(); const start = performance.now();
  const finish = (response: Response) => { response.headers.set("Cache-Control", "no-store"); return response; };
  try {
    if (!["GET", "POST", "DELETE"].includes(request.method)) throw new PublicApiError("AIC-REQ-1001");
    if (request.method !== "GET") assertSameOrigin(request);
    const actor = actorFromWebsiteSession(await dependencies.session(request), requestId);
    if (request.method !== "GET") enforceRateLimit("agent-consent", actor.userId, 20, 60_000);
    if (request.method === "DELETE") {
      await assertEmptyBody(request, 1024);
      await dependencies.access.store.revoke(actor.userId);
    }
    if (request.method === "POST") {
      const body = exact(await readJsonBody(request, 2048), ["accept", "binding"]);
      if (body.accept !== true) throw new PublicApiError("AIC-REQ-1001");
      const status = await dependencies.access.status(actor.userId);
      if (!status.binding || !["consent_required", "consent_outdated", "consent_revoked", "ready"].includes(status.state)) throw new PublicApiError("AIC-AUTH-2007");
      const binding = exact(body.binding, Object.keys(status.binding));
      if (Object.entries(status.binding).some(([key, value]) => binding[key] !== value)) throw new PublicApiError("AIC-REQ-1001");
      // Client echoes displayed versions to reject a stale consent card; identity and versions are server-owned.
      await dependencies.access.store.grant({ userId: actor.userId, ...status.binding, grantedAt: new Date(), revokedAt: null });
    }
    return finish(successResponse(await dependencies.access.status(actor.userId), requestId));
  } catch (error) {
    const safe = new PublicApiError(error instanceof PublicApiError ? error.code : "AIC-REQ-1001");
    return finish(failureResponse(safe, requestId, "/api/agent/consent", start));
  }
}
