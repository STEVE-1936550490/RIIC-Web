import { handlePlanningRequest } from "@/server/planning-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handlePlanningRequest(request);
