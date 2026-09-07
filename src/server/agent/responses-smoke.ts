// CLI/test-only synthetic acceptance. No DB, account session or page data is loaded.
import { createHash } from "node:crypto";
import { syntheticExecution, syntheticEgress } from "./m3-test-support.ts";
import { syntheticSavedPlan, savedPlanComparisonTestContext, savedPlanTestNow } from "./saved-plan-test-fixtures.ts";
import { createSavedPlanReadService } from "../saved-plan-read-service.ts";
import { createResponsesTransport } from "./responses-transport.ts";
import { createResponsesModelProvider } from "./openai-model-provider.ts";
import { createResponsesLoopProvider } from "./openai-loop-provider.ts";
import { AgentModelError, callStructuredAgentIntent } from "./model-client.ts";
import { createAgentIntentMessages } from "./intent-prompt.ts";
import { AgentRunError, record } from "./run-contract.ts";
import type { ResponsesConfig } from "./responses-config.ts";
import type { LoopObservation, LoopProvider } from "./loop-provider.ts";
import type { AgentModelUsage } from "./model-provider.ts";
import { assertModelEgress } from "./egress-policy.ts";
const { runReadOnlyAgent } = await import("./orchestrator.ts");

type Capability = { status: "PASS" | "FAIL" | "BLOCKED"; code?: string; tools?: Array<{ name: string; status: string }> };
function ensure(value: unknown): asserts value { if (!value) throw new AgentRunError("AGENT_RESPONSES_SMOKE_FACT_MISMATCH"); }
function failure(error: unknown): Capability {
  const safe = error instanceof AgentRunError ? error : error instanceof AgentModelError && error.cause instanceof AgentRunError ? error.cause : null;
  return { status: safe?.code === "AGENT_RESPONSES_REQUEST_BUDGET" ? "BLOCKED" : "FAIL", code: safe?.code ?? "AGENT_RESPONSES_SMOKE_FAILED" };
}
export async function runSyntheticResponsesSmoke(config: ResponsesConfig, fetcher: typeof fetch = fetch) {
  const budget = { requests: 0, maximum: 12 }; const reportedModels = new Set<string>(); const usage: Array<AgentModelUsage | null> = [];
  const raw = createResponsesTransport(config, fetcher, budget);
  const transport: typeof raw = { async create(request, options) {
    assertModelEgress("external", syntheticEgress);
    const result = await raw.create(request, options);
    if (result.model) reportedModels.add(result.model);
    usage.push(result.usage ?? null); return result;
  } };
  const capabilities: Record<string, Capability> = {};
  try {
    const result = await transport.create({ model: config.model, input: "Synthetic protocol probe. Reply exactly SYNTHETIC_RESPONSES_OK.", store: false, max_output_tokens: 128,
      ...(config.reasoning === "encrypted" ? { include: ["reasoning.encrypted_content"] } : {}) }, { signal: AbortSignal.timeout(15000), timeout: 15000, maxRetries: 0 });
    ensure(result.output.some((item) => item.type === "message" && item.content.some((c) => c.type === "output_text" && c.text.trim() === "SYNTHETIC_RESPONSES_OK")));
    capabilities.responsesBasic = { status: "PASS" };
  } catch (error) { capabilities.responsesBasic = failure(error); }
  try {
    const result = await callStructuredAgentIntent({ provider: createResponsesModelProvider(config, transport), messages: createAgentIntentMessages("看看贸易站 1 的情况"), egress: syntheticEgress, timeoutMs: 15000, maxOutputTokens: 512 });
    ensure(result.decision.intent === "get_room_detail" && result.decision.roomRef === "贸易站 1" && result.decision.canProceed);
    capabilities.strictStructuredOutput = { status: "PASS" };
  } catch (error) { capabilities.strictStructuredOutput = failure(error); }

  for (const scenario of ["current", "saved"] as const) {
    try {
      const context = syntheticExecution();
      const rows = [syntheticSavedPlan("synthetic-left"), syntheticSavedPlan("synthetic-right"), syntheticSavedPlan("synthetic-foreign", "another-owner")];
      rows[0].title = "合成方案 A"; rows[1].title = "合成方案 B";
      ensure(rows[1].publicResult.rotation.daily.production); rows[1].publicResult.rotation.daily.production.lmd = 150;
      context.savedPlans = createSavedPlanReadService({ requireConsent: async () => {}, loadMetadata: async () => rows, now: () => savedPlanTestNow });
      context.comparison = savedPlanComparisonTestContext(rows).service;
      const adapter = createResponsesLoopProvider(config, transport); let observations: LoopObservation[] = [];
      // Observe actual orchestrator-executed results, never fabricate decisions or tool outputs.
      const provider: LoopProvider = { kind: "external", async next(request) {
        observations = structuredClone(request.observations);
        const response = await adapter.next(request);
        if (scenario === "saved" && response.decision.type === "calls" && response.decision.calls.some((c) => c.name === "saved_plan.compare")) {
          ensure(observations.some((o) => o.call.name === "saved_plan.list" && record(o.result).status === "ok"));
        }
        return response;
      } };
      const message = scenario === "current"
        ? "请查询当前方案概览和 trade_1 房间（active shift），报告总班次数和计划干员展示名。必须查询两项事实，不猜测。"
        : "请先列出标题含‘合成方案’的已保存方案，再用列表实际返回的 ID 比较合成方案 A（左）和合成方案 B（右）。报告两者自然24小时龙门币数值及右减左差值，不猜 ID。";
      const result = await runReadOnlyAgent({ context, message, provider, egress: syntheticEgress });
      if (result.status !== "ok") throw new AgentRunError(result.error ?? "AGENT_RESPONSES_SMOKE_FAILED");
      ensure(result.tools.every((tool) => tool.status === "ok"));
      if (scenario === "current") {
        const summary = observations.find((o) => o.call.name === "current_plan.get_summary");
        const room = observations.find((o) => o.call.name === "current_plan.get_room_detail");
        ensure(summary && room && record(room.call.arguments).roomRef === "trade_1" && record(room.call.arguments).shiftIndex === null);
        ensure(JSON.stringify(summary.result).includes('"shiftCount":2') && JSON.stringify(room.result).includes("贸易甲"));
        ensure(result.answer.includes("贸易甲") && /2|两|二/.test(result.answer));
        ensure(result.sources.some((s) => s.contextRevision === context.snapshot.contextRevision && s.sampledAt === context.snapshot.sampledAt));
      } else {
        const listIndex = observations.findIndex((o) => o.call.name === "saved_plan.list");
        const compareIndex = observations.findIndex((o) => o.call.name === "saved_plan.compare");
        ensure(listIndex >= 0 && compareIndex > listIndex);
        const list = record(observations[listIndex].result); ensure(Array.isArray(list.plans));
        const ids = list.plans.map((p) => record(p).id); const args = record(observations[compareIndex].call.arguments);
        ensure(args.leftPlanId === "synthetic-left" && args.rightPlanId === "synthetic-right" && ids.includes(args.leftPlanId) && ids.includes(args.rightPlanId) && !ids.includes("synthetic-foreign"));
        const data = record(record(observations[compareIndex].result).data); const production = record(data.production);
        ensure(Array.isArray(production.metrics));
        ensure(production.metrics.some((m) => { const metric = record(m); const diff = record(metric.comparison); return metric.metric === "lmd" && diff.status === "comparable" && diff.left === 100 && diff.right === 150 && diff.delta === 50; }));
        ensure(["100", "150", "50"].every((fact) => result.answer.includes(fact)));
        ensure(["synthetic-left", "synthetic-right"].every((id) => result.sources.some((s) => s.planId === id)) && !result.sources.some((s) => s.planId === "synthetic-foreign"));
      }
      capabilities[scenario] = { status: "PASS", tools: result.tools.map(({ name, status }) => ({ name, status })) };
    } catch (error) { capabilities[scenario] = failure(error); }
  }
  const all = Object.values(capabilities).every((c) => c.status === "PASS");
  return { status: all ? "PASS" : Object.values(capabilities).some((c) => c.code?.includes("INCOMPATIBLE") || c.code?.includes("CONTINUATION_UNSUPPORTED")) ? "CAPABILITY_INCOMPATIBLE" : "FAIL",
    endpointId: createHash("sha256").update(config.baseURL).digest("hex").slice(0, 12), protocol: config.protocol, requestedModel: config.model,
    reportedModels: [...reportedModels].sort(), requests: budget.requests, capabilities,
    functionToolLoop: capabilities.current.status === "PASS" && capabilities.saved.status === "PASS" ? "PASS" : "FAIL",
    usage: usage.length === budget.requests && usage.every((u) => u !== null) ? usage : "unavailable",
    limitations: ["SYNTHETIC_ONLY", "AUTOMATIC_TOOL_SELECTION_NOT_FORCED", "FACT_CHECKS_ARE_NARROW_NOT_SEMANTIC_PROOF", "REPORTED_MODEL_IS_UNVERIFIED", "STORE_FALSE_IS_NOT_RETENTION_GUARANTEE", "THIS_CONFIGURATION_AND_REQUEST_SHAPES_ONLY", "REAL_USER_CONTEXT_BLOCKED_PRIVACY"] };
}
