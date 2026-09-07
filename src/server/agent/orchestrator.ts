import "server-only";
import { randomUUID } from "node:crypto";
import { executeRegisteredTool, visibleTools, type ToolResult } from "./tool-registry.ts";
import { validatedSnapshot, isIssuedActor, type AgentExecutionContext } from "./execution-context.ts";
import { assertModelEgress, type EgressContext } from "./egress-policy.ts";
import { parseLoopDecision, type LoopProvider, type LoopObservation } from "./loop-provider.ts";
import { AGENT_RUN_LIMITS as LIMIT, AgentRunError, record, text, type AgentFinalResult, type AgentSource } from "./run-contract.ts";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, milliseconds: number, code: string): Promise<T> {
  if (signal.aborted) throw new AgentRunError("AGENT_ABORTED");
  const controller = new AbortController();
  let rejectAbort: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(new AgentRunError("AGENT_ABORTED")); };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { controller.abort(); rejectAbort(new AgentRunError(code)); }, milliseconds);
  try { return await Promise.race([Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); }), interrupted]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
function sourcesFor(result: ToolResult): AgentSource[] {
  const source = result.source;
  if (source.type === "current_context") {
    const sources: AgentSource[] = [{ type: "current_context", contextRevision: source.contextRevision, planDiagnosticId: source.planDiagnosticId, sampledAt: source.sampledAt, updatedAt: null, planId: null }];
    if ("data" in result && result.data && "observed" in result.data && result.data.observed.status === "available") sources.push({ type: "observed_schedule", contextRevision: source.contextRevision, planDiagnosticId: source.planDiagnosticId, sampledAt: result.data.observed.sampledAt, updatedAt: null, planId: null });
    return sources;
  }
  const plans = "plans" in result ? result.plans : "data" in result && result.data && "left" in result.data ? [result.data.left, result.data.right] : [];
  return plans.map((plan) => ({ type: "saved_plan", contextRevision: null, planDiagnosticId: plan.diagnosticId, sampledAt: null, updatedAt: plan.updatedAt, planId: plan.id }));
}

/** No persistence or raw logs. All metadata returned is explicitly built here. */
export async function runReadOnlyAgent(input: {
  message: string; context: AgentExecutionContext; provider: LoopProvider; egress: EgressContext; signal?: AbortSignal;
  // Tests may lower deadlines, never raise production limits.
  deadlines?: { totalMs?: number; toolMs?: number };
}): Promise<AgentFinalResult> {
  const result: AgentFinalResult = { status: "failed", answer: "", runId: randomUUID(), contextRevision: null,
    modelMode: input.provider.kind === "fake" ? "fake_test" : "external", intent: null, sources: [], limitations: ["READ_ONLY_POC", "PAGE_CONTEXT_IS_NOT_AUTHORIZATION"], tools: [], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, error: null };
  const signal = input.signal ?? new AbortController().signal;
  const started = performance.now();
  const totalMs = Math.max(1, Math.min(input.deadlines?.totalMs ?? LIMIT.totalMs, LIMIT.totalMs));
  const toolMs = Math.max(1, Math.min(input.deadlines?.toolMs ?? LIMIT.toolMs, LIMIT.toolMs));
  const remaining = () => { const ms = totalMs - (performance.now() - started); if (ms <= 0) throw new AgentRunError("AGENT_RUN_TIMEOUT"); return ms; };
  try {
    const message = text(input.message, 2000);
    const context = { ...input.context, snapshot: validatedSnapshot(input.context.snapshot) };
    result.contextRevision = context.snapshot?.contextRevision ?? null;
    if (!isIssuedActor(context.actor)) throw new AgentRunError("AGENT_ACTOR_REQUIRED");
    const observations: LoopObservation[] = [];
    const repeated = new Set<string>(); const callIds = new Set<string>(); let failed = false;
    for (let step = 1; step <= LIMIT.steps; step++) {
      if (signal.aborted) throw new AgentRunError("AGENT_ABORTED");
      // Includes the user message and all previous observations, not just the initial context.
      assertModelEgress(input.provider.kind, input.egress);
      let response;
      try { response = await bounded((providerSignal) => input.provider.next({ message, tools: visibleTools(context), observations: structuredClone(observations), signal: providerSignal, egress: input.egress }), signal, remaining(), "AGENT_RUN_TIMEOUT"); }
      catch (error) { if (error instanceof AgentRunError) throw error; throw new AgentRunError("AGENT_PROVIDER_ERROR"); }
      remaining();
      if (response.usage) for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
        const value = response.usage[key] ?? 0;
        if (!Number.isSafeInteger(value) || value < 0) throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT");
        result.usage[key] += value;
      }
      if (Math.max(result.usage.totalTokens, result.usage.inputTokens + result.usage.outputTokens) > LIMIT.tokens) throw new AgentRunError("AGENT_USAGE_LIMIT");
      let decision;
      try { decision = parseLoopDecision(response.decision); } catch { throw new AgentRunError("AGENT_MODEL_INVALID_OUTPUT"); }
      if (decision.type === "final") {
        result.status = failed ? "failed" : "ok";
        result.error = failed ? "AGENT_TOOL_FAILURE" : null;
        // A provider cannot turn a failed/ambiguous/missing tool observation into a success claim.
        result.answer = failed ? "工具未能完整回答问题，请查看工具状态并补充引用或重试。 / Tool results are incomplete; clarify references or retry." : decision.answer;
        break;
      }
      if (result.tools.length + decision.calls.length > LIMIT.calls) throw new AgentRunError("AGENT_TOOL_CALL_LIMIT");
      for (const call of decision.calls) {
        remaining();
        const signature = `${call.name}:${canonical(call.arguments)}`;
        if (repeated.has(signature) || callIds.has(call.id)) throw new AgentRunError("AGENT_REPEATED_TOOL_CALL");
        repeated.add(signature); callIds.add(call.id);
        const toolStarted = performance.now();
        let observation: unknown; let status = "failed"; let code: string | null = null;
        try {
          const value = await bounded(() => executeRegisteredTool(call.name, call.arguments, context), signal, Math.min(toolMs, remaining()), "AGENT_TOOL_TIMEOUT");
          if (new TextEncoder().encode(JSON.stringify(value)).length > LIMIT.resultBytes) throw new AgentRunError("AGENT_RESULT_LIMIT");
          observation = value; status = value.status;
          code = "issue" in value ? value.issue.code : null;
          if (status === "ok" || status === "empty") {
            for (const source of sourcesFor(value)) if (!result.sources.some((s) => canonical(s) === canonical(source))) result.sources.push(source);
          } else failed = true;
          if (value.truncation.applied && !result.limitations.includes("TOOL_RESULT_TRUNCATED")) result.limitations.push("TOOL_RESULT_TRUNCATED");
          if ("data" in value && value.data && "limitations" in value.data) for (const item of value.data.limitations) {
            const label = typeof item === "string" ? item : record(item).code;
            if (typeof label === "string" && !result.limitations.includes(label) && result.limitations.length < 16) result.limitations.push(label);
          }
        } catch (error) {
          if (signal.aborted) throw new AgentRunError("AGENT_ABORTED");
          code = error instanceof AgentRunError ? error.code : "AGENT_TOOL_ERROR";
          observation = { status: "unavailable", issue: { code } }; failed = true;
        }
        // Unknown model-supplied names are never reflected into client traces.
        const name = visibleTools(context).some((t) => t.name === call.name) ? call.name : "unavailable_tool";
        result.tools.push({ name, step, status, code, latencyMs: Math.max(0, Math.round(performance.now() - toolStarted)) });
        observations.push({ call, result: observation });
        if (new TextEncoder().encode(JSON.stringify(observations)).length > LIMIT.observationBytes) throw new AgentRunError("AGENT_OBSERVATION_LIMIT");
      }
      if (step === LIMIT.steps) throw new AgentRunError("AGENT_STEP_LIMIT");
    }
  } catch (error) {
    result.status = "failed"; result.error = error instanceof AgentRunError ? error.code : "AGENT_RUN_FAILED";
    result.answer = "本轮未完成，未修改任何业务数据。 / Run incomplete; no business data was modified.";
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > LIMIT.resultBytes) {
    result.sources = result.sources.slice(0, 8); result.limitations = ["FINAL_RESULT_TRUNCATED"]; result.answer = result.answer.slice(0, 1000);
  }
  return result;
}
