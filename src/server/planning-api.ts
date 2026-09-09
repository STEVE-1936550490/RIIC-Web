import { assertSameOrigin, createRequestId, failureResponse, readJsonBody, requestClientIp, successResponse } from "@/server/api-contract";
import { websiteSession } from "@/server/auth";
import { requireWebsiteSession } from "@/server/auth/authorization";
import { isPlanTaskQueueEnabled } from "@/server/business-config";
import { planningActorFromSession } from "@/server/planning-actor";
import { executePlanning, planningAccess, type PlanningBody } from "@/server/planning-service";

export const planningApiDependencies = { websiteSession, requireWebsiteSession, executePlanning, dataOwnerTag: async () => {
  const { activeSklandAccount, readSklandAccountStore } = await import("./skland/http.ts");
  const { sklandDataOwnerTag } = await import("./skland/session.ts");
  const account = activeSklandAccount(await readSklandAccountStore());
  return account ? sklandDataOwnerTag(account.session.userId) : null;
} };
export async function handlePlanningRequest(request: Request, dependencies = planningApiDependencies) {
  const { websiteSession, requireWebsiteSession, executePlanning } = dependencies;
  const requestId = createRequestId(); const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 2 * 1024 * 1024) as PlanningBody;
    const access = planningAccess(body, isPlanTaskQueueEnabled());
    const session = access === "trusted-sample" ? await websiteSession(request).catch(() => null) : await requireWebsiteSession(request);
    let dataOwnerTag: string | null = null;
    if (body.boxSource === "skland") {
      dataOwnerTag = await dependencies.dataOwnerTag();
    }
    const { result } = await executePlanning({ body, actor: planningActorFromSession(session), ip: requestClientIp(request), requestId,
      includeDebug: new URL(request.url).searchParams.get("beta") === "1", dataOwnerTag, signal: request.signal });
    return successResponse(result, requestId);
  } catch (error) { return failureResponse(error, requestId, "/api/plan", startedAt, "AIC-SYS-5000", request); }
}
