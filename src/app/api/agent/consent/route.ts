import { handleAgentConsent } from "@/server/agent/consent-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleAgentConsent(request);
export const POST = (request: Request) => handleAgentConsent(request);
export const DELETE = (request: Request) => handleAgentConsent(request);
