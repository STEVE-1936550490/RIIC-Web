import { handleAgentRequest } from "@/server/agent/agent-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleAgentRequest(request); }
export async function POST(request: Request) { return handleAgentRequest(request); }
