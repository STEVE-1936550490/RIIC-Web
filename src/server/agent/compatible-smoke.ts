import { validateSyntheticAcceptanceOptions, type SyntheticAcceptanceOptions } from "./synthetic-acceptance-options.ts";
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
import type { ModelConfig } from "./compatible-config.ts";
import { createChatCompletionsTransport, type ChatCompletionsConfig } from "./chat-completions-transport.ts";
import { createChatCompletionsLoopProvider, createChatCompletionsModelProvider } from "./chat-completions-provider.ts";
import { diagnosticForError, type SafeProviderDiagnostic } from "./compatible-transport.ts";
import { parseLoopDecision, type LoopObservation, type LoopProvider } from "./loop-provider.ts";
import type { AgentModelUsage } from "./model-provider.ts";
import { assertModelEgress } from "./egress-policy.ts";
const { runReadOnlyAgent } = await import("./orchestrator.ts");
const { executeRegisteredTool } = await import("./tool-registry.ts");

type Capability = { stage?: string; requests?: number; status: "PASS" | "FAIL" | "BLOCKED"; code?: string; diagnostic?: SafeProviderDiagnostic; tools?: Array<{ name: string; status: string }> };
function ensure(value: unknown, check?: string): asserts value { if (!value) throw new AgentRunError(check ? `AGENT_MODEL_SMOKE_FACT_MISMATCH_${check}` : "AGENT_MODEL_SMOKE_FACT_MISMATCH"); }
function failure(error: unknown): Capability {
  if (error instanceof AgentModelError) {
    if (error.cause instanceof AgentRunError) {
      return {
        status: error.code === "AGENT_MODEL_TIMEOUT" || error.code === "AGENT_MODEL_ABORTED" ? "BLOCKED" : "FAIL",
        code: error.cause.code,
        diagnostic: diagnosticForError(error.cause),
      };
    }
    return {
      status: "FAIL",
      code: error.code,
      diagnostic: { category: "provider_error", upstreamCode: "UNKNOWN", upstreamType: "UNKNOWN", rootCause: "UNRESOLVED" },
    };
  }
  const safe = error instanceof AgentRunError ? error : null;
  return { status: safe?.code.endsWith("REQUEST_BUDGET") ? "BLOCKED" : "FAIL", code: safe?.code ?? "AGENT_MODEL_SMOKE_FAILED", diagnostic: diagnosticForError(safe ?? new AgentRunError("AGENT_MODEL_SMOKE_FAILED")) };
}
export async function runSyntheticCompatibleSmoke(config: ModelConfig, fetcher: typeof fetch = fetch, mode: "basic" | "full" = "full", acceptanceDeadlines: SyntheticAcceptanceOptions = {}) {
  if (mode !== "basic" && mode !== "full") throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
  validateSyntheticAcceptanceOptions(acceptanceDeadlines);
  if (acceptanceDeadlines.chatLegacyCompat && config.protocol !== "chat_completions") throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
  const budget = { requests: 0, maximum: mode === "basic" ? 1 : 12 }; const reportedModels = new Set<string>(); const usage: Array<AgentModelUsage | null> = [];
  const track = (result: { model?: string; usage?: AgentModelUsage }) => { if (result.model) reportedModels.add(result.model); usage.push(result.usage ?? null); };
  const options = () => ({ signal: AbortSignal.timeout(15000), timeout: 15000, maxRetries: 0 as const });
  const setup = () => {
    if (config.protocol === "responses") {
      const cfg = config as ResponsesConfig;
      const raw = createResponsesTransport(cfg, fetcher, budget);
      const transport: typeof raw = { async create(request, opts) { assertModelEgress("external", syntheticEgress); const result = await raw.create(request, opts); track(result); return result; } };
      return {
        model: createResponsesModelProvider(cfg, transport), loop: () => createResponsesLoopProvider(cfg, transport),
        async probe(json: boolean) {
          const result = await transport.create({ model: cfg.model, input: json ? 'Synthetic JSON probe. Reply with exactly {"synthetic":true} as JSON.' : "Synthetic protocol probe. Reply exactly SYNTHETIC_RESPONSES_OK.",
            ...(json ? { text: { format: { type: "json_object" as const } } } : {}), store: false, max_output_tokens: 128 }, options());
          ensure(!result.output.some((i) => i.type === "function_call"));
          return result.output.flatMap((i) => i.type === "message" ? i.content.flatMap((c) => c.type === "output_text" ? [c.text] : []) : []).join("\n");
        },
      };
    }
    const cfg = config as ChatCompletionsConfig;
    const raw = createChatCompletionsTransport(cfg, fetcher, budget, acceptanceDeadlines.chatLegacyCompat);
    const transport: typeof raw = { async create(request, opts) { assertModelEgress("external", syntheticEgress); const result = await raw.create(request, opts); track(result); return result; } };
    return {
      model: createChatCompletionsModelProvider(cfg, transport), loop: () => createChatCompletionsLoopProvider(cfg, transport),
      async probe(json: boolean) {
        const result = await transport.create({ model: cfg.model, messages: [{ role: "user", content: json ? 'Synthetic JSON probe. Reply with exactly {"synthetic":true} as JSON.' : "Synthetic protocol probe. Reply exactly SYNTHETIC_CHAT_OK." }],
          ...(json ? { response_format: { type: "json_object" as const } } : {}), store: false, max_completion_tokens: 128 }, options());
        ensure(!result.calls.length && result.content); return result.content;
      },
    };
  };
  const adapterFactory = setup();
  const capabilities: Record<string, Capability> = {};
  let stopped = false;
  const failed = (error: unknown) => {
    const result = failure(error);
    if (result.diagnostic?.category === "authentication_error" || /RATE_LIMITED|CONFIG_INVALID|SERVER_ERROR|NETWORK_ERROR|TIMEOUT|ABORTED|REDIRECT|REQUEST_BUDGET/.test(result.code ?? "")) stopped = true;
    return result;
  };
  const blocked = (): Capability => ({ status: "BLOCKED", code: mode === "basic" ? "BASIC_MODE_ONLY" : capabilities.basicCompletion?.status !== "PASS" ? "BASIC_COMPLETION_REQUIRED" : "ACCEPTANCE_STOPPED" });
  const probe = async (stage: string, work: () => Promise<unknown>) => {
    const start = budget.requests;
    try { await work(); capabilities[stage] = { status: "PASS" }; }
    catch (error) { capabilities[stage] = failed(error); }
    Object.assign(capabilities[stage], { stage, requests: budget.requests - start });
  };
  await probe("basicCompletion", async () => {
    ensure((await adapterFactory.probe(false)).trim() === (config.protocol === "responses" ? "SYNTHETIC_RESPONSES_OK" : "SYNTHETIC_CHAT_OK"));
  });
  for (const stage of ["jsonOutput", "strictStructuredOutput"] as const) {
    if (mode === "basic" || stopped || capabilities.basicCompletion.status !== "PASS") { capabilities[stage] = { ...blocked(), stage, requests: 0 }; continue; }
    await probe(stage, async () => {
      if (stage === "jsonOutput") {
        const json = JSON.parse(await adapterFactory.probe(true)) as unknown;
        ensure(record(json).synthetic === true && Object.keys(record(json)).length === 1);
      } else {
        const strictTimeoutMs = acceptanceDeadlines.strictMs ?? 15000;
        if (strictTimeoutMs <= 0) throw new AgentRunError("AGENT_MODEL_SMOKE_FAILED");
        const result = await callStructuredAgentIntent({ provider: adapterFactory.model, messages: createAgentIntentMessages("看看贸易站 1 的情况"), egress: syntheticEgress, timeoutMs: strictTimeoutMs, maxOutputTokens: 512 });
        ensure(result.decision.intent === "get_room_detail" && result.decision.roomRef === "贸易站 1" && result.decision.canProceed);
      }
    });
  }

  for (const scenario of ["current", "saved"] as const) {
    if (mode === "basic" || stopped || capabilities.basicCompletion.status !== "PASS") { capabilities[scenario] = { ...blocked(), stage: scenario, requests: 0 }; continue; }
    const start = budget.requests;
    try {
      const context = syntheticExecution();
      const rows = [syntheticSavedPlan("synthetic-left"), syntheticSavedPlan("synthetic-right"), syntheticSavedPlan("synthetic-foreign", "another-owner")];
      rows[0].title = "合成方案 A"; rows[1].title = "合成方案 B";
      ensure(rows[1].publicResult.rotation.daily.production); rows[1].publicResult.rotation.daily.production.lmd = 150;
      context.savedPlans = createSavedPlanReadService({ requireConsent: async () => {}, loadMetadata: async () => rows, now: () => savedPlanTestNow });
      context.comparison = savedPlanComparisonTestContext(rows).service;
      const adapter = adapterFactory.loop(); let observations: LoopObservation[] = []; let providerFailure: unknown;
      // Observe actual orchestrator-executed results, never fabricate decisions or tool outputs.
      const provider: LoopProvider = { kind: "external", async next(request) {
        observations = structuredClone(request.observations);
        const response = await adapter.next(request).catch((error: unknown) => { providerFailure = error; throw error; });
        const decision = parseLoopDecision(response.decision);
        if (scenario === "saved" && decision.type === "calls" && decision.calls.some((c) => c.name === "saved_plan.compare")) {
          ensure(observations.some((o) => o.call.name === "saved_plan.list" && record(o.result).status === "ok"));
        }
        return response;
      } };
      const message = scenario === "current"
        ? "请查询当前方案概览和 trade_1 房间（active shift），报告总班次数和计划干员展示名。必须查询两项事实，不猜测。"
        : "请先列出标题含‘合成方案’的已保存方案，再用列表实际返回的 ID 比较合成方案 A（左）和合成方案 B（右）。报告两者自然24小时龙门币数值及右减左差值，不猜 ID。";
      const result = await runReadOnlyAgent({ context, message, provider, egress: syntheticEgress, ...(acceptanceDeadlines.totalMs || acceptanceDeadlines.toolMs ? {
        syntheticAcceptance: true,
        deadlines: {
          ...(acceptanceDeadlines.totalMs ? { totalMs: acceptanceDeadlines.totalMs } : {}),
          ...(acceptanceDeadlines.toolMs ? { toolMs: acceptanceDeadlines.toolMs } : {}),
        },
      } : {}) });
      if (result.status !== "ok") throw providerFailure ?? new AgentRunError(result.error ?? "AGENT_MODEL_SMOKE_FAILED");
      ensure(result.tools.every((tool) => tool.status === "ok"));
      if (scenario === "current") {
        const summary = observations.find((o) => o.call.name === "current_plan.get_summary");
        const room = observations.find((o) => o.call.name === "current_plan.get_room_detail");
        ensure(summary && room, "CURRENT_REQUIRED_TOOLS");
        ensure(record(room.call.arguments).roomRef === "trade_1", "CURRENT_ROOM_REF");
        ensure(record(room.call.arguments).shiftIndex === null, "CURRENT_ACTIVE_SHIFT_ARGUMENT");
        ensure(record(record(summary.result).data).shiftCount === 2, "CURRENT_SHIFT_COUNT");
        const detail = record(record(room.result).data);
        const shift = record(detail.shift); const planned = record(detail.planned); const observed = record(detail.observed);
        ensure(record(detail.room).roomId === "trade_1" && shift.requestedShiftIndex === null && shift.resolvedShiftIndex === context.snapshot.activeShift && shift.usedActiveShift === true, "CURRENT_SHIFT_RESULT");
        ensure(planned.status === "available" && Array.isArray(planned.operators) && planned.operators.includes("贸易甲"), "CURRENT_PLANNED_OPERATORS");
        ensure(observed.status === "unavailable" && record(observed.issue).reason === "NO_OBSERVED_SNAPSHOT", "CURRENT_OBSERVED_STATUS");
        ensure(result.answer.includes("贸易甲") && /2|两|二/.test(result.answer), "CURRENT_ANSWER");
        ensure(result.sources.some((s) => s.contextRevision === context.snapshot.contextRevision && s.sampledAt === context.snapshot.sampledAt), "CURRENT_SOURCES");
      } else {
        const listIndex = observations.findIndex((o) => o.call.name === "saved_plan.list");
        const compareIndex = observations.findIndex((o) => o.call.name === "saved_plan.compare");
        ensure(listIndex >= 0 && compareIndex > listIndex, "SAVED_TOOL_ORDER");
        const list = record(observations[listIndex].result); ensure(Array.isArray(list.plans), "SAVED_LIST");
        const ids = list.plans.map((p) => record(p).id); const args = record(observations[compareIndex].call.arguments);
        ensure(args.leftPlanId === "synthetic-left" && args.rightPlanId === "synthetic-right" && ids.includes(args.leftPlanId) && ids.includes(args.rightPlanId) && !ids.includes("synthetic-foreign"), "SAVED_PLAN_IDS");
        const data = record(record(observations[compareIndex].result).data); const production = record(data.production);
        ensure(Array.isArray(production.metrics), "SAVED_PRODUCTION");
        ensure(production.metrics.some((m) => { const metric = record(m); const diff = record(metric.comparison); return metric.metric === "lmd" && diff.status === "comparable" && diff.left === 100 && diff.right === 150 && diff.delta === 50; }), "SAVED_PRODUCTION");
        ensure(["100", "150", "50"].every((fact) => result.answer.includes(fact)), "SAVED_ANSWER");
        ensure(["synthetic-left", "synthetic-right"].every((id) => result.sources.some((s) => s.planId === id)) && !result.sources.some((s) => s.planId === "synthetic-foreign"), "SAVED_SOURCES");
        // Local negative control through the actual Registry/M2/domain policy, not a model observation or extra HTTP request.
        const forbidden = record(await executeRegisteredTool("saved_plan.compare", { leftPlanId: "synthetic-left", rightPlanId: "synthetic-foreign" }, context));
        ensure(forbidden.status === "missing" && record(forbidden.issue).code === "PLAN_NOT_FOUND_OR_FORBIDDEN" && !Object.hasOwn(forbidden, "data"), "SAVED_AUTHORIZATION");
      }
      capabilities[scenario] = { status: "PASS", tools: result.tools.map(({ name, status }) => ({ name, status })) };
    } catch (error) { capabilities[scenario] = failed(error); }
    Object.assign(capabilities[scenario], { stage: scenario, requests: budget.requests - start });
  }
  const all = mode === "basic" ? capabilities.basicCompletion.status === "PASS" : Object.values(capabilities).every((c) => c.status === "PASS");
  return { status: all ? "PASS" : Object.values(capabilities).some((c) => c.code?.includes("INCOMPATIBLE") || c.code?.includes("CONTINUATION_UNSUPPORTED")) ? "CAPABILITY_INCOMPATIBLE" : "FAIL",
    compatibilityMode: acceptanceDeadlines.chatLegacyCompat ? "explicit_chat_legacy" : "default_strict", acceptanceDeadlines: { strictMs: acceptanceDeadlines.strictMs ?? 15000, totalMs: acceptanceDeadlines.totalMs ?? 20000, toolMs: acceptanceDeadlines.toolMs ?? 5000 },
    mode, requestLimit: budget.maximum, requestShape: "m3.5b-strict-tools-v1", endpointId: createHash("sha256").update(config.baseURL).digest("hex").slice(0, 12), protocol: config.protocol, requestedModel: config.model,
    reportedModels: [...reportedModels].sort(), requests: budget.requests, capabilities,
    functionToolLoop: capabilities.current.status === "PASS" && capabilities.saved.status === "PASS" ? "PASS" : capabilities.current.status === "BLOCKED" || capabilities.saved.status === "BLOCKED" ? "BLOCKED" : "FAIL",
    usage: usage.length === budget.requests && usage.every((u) => u !== null) ? usage : "unavailable",
    limitations: ["SYNTHETIC_ONLY", "AUTOMATIC_TOOL_SELECTION_NOT_FORCED", "FACT_CHECKS_ARE_NARROW_NOT_SEMANTIC_PROOF", "REPORTED_MODEL_IS_UNVERIFIED", "STORE_FALSE_IS_NOT_RETENTION_GUARANTEE", "THIS_CONFIGURATION_AND_REQUEST_SHAPES_ONLY", "REAL_USER_CONTEXT_BLOCKED_PRIVACY"] };
}
