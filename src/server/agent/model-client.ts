import {
  AGENT_INTENT_DECISION_OUTPUT_CONTRACT,
  AgentIntentContractError,
  AgentIntentShapeError,
  parseAgentIntentDecision,
  validateAgentIntentDecision,
  type AgentIntentDecision,
} from "./intent-contract.ts";
import type {
  AgentModelMessage,
  AgentModelMetadata,
  AgentModelProvider,
  AgentModelProviderResult,
} from "./model-provider.ts";

export type AgentModelErrorCode =
  | "AGENT_MODEL_TIMEOUT"
  | "AGENT_MODEL_ABORTED"
  | "AGENT_MODEL_PROVIDER_ERROR"
  | "AGENT_MODEL_INVALID_OUTPUT"
  | "AGENT_MODEL_CONTRACT_VIOLATION";

const ERROR_MESSAGES: Record<AgentModelErrorCode, string> = {
  AGENT_MODEL_TIMEOUT: "Agent 模型调用超时。",
  AGENT_MODEL_ABORTED: "Agent 模型调用已取消。",
  AGENT_MODEL_PROVIDER_ERROR: "Agent 模型供应商调用失败。",
  AGENT_MODEL_INVALID_OUTPUT: "Agent 模型返回的结构化输出格式无效。",
  AGENT_MODEL_CONTRACT_VIOLATION: "Agent 模型返回的结构化输出违反业务契约。",
};

export class AgentModelError extends Error {
  readonly code: AgentModelErrorCode;

  constructor(
    code: AgentModelErrorCode,
    options: { cause?: unknown } = {},
  ) {
    super(ERROR_MESSAGES[code], options);
    this.name = "AgentModelError";
    this.code = code;
  }
}

export type CallStructuredAgentIntentInput = {
  egress?: import("./egress-policy.ts").EgressContext;
  provider: AgentModelProvider;
  messages: readonly AgentModelMessage[];
  timeoutMs: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type StructuredAgentIntentResult = {
  decision: AgentIntentDecision;
  metadata: AgentModelMetadata;
};

class AgentModelInvocationInterrupted extends Error {}

export async function callStructuredAgentIntent({
  provider,
  messages,
  timeoutMs,
  maxOutputTokens,
  signal,
  egress,
}: CallStructuredAgentIntentInput): Promise<StructuredAgentIntentResult> {
  if (signal?.aborted) throw new AgentModelError("AGENT_MODEL_ABORTED");

  const providerController = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const abortProvider = () => {
    externallyAborted = true;
    providerController.abort();
  };
  signal?.addEventListener("abort", abortProvider, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    providerController.abort();
  }, timeoutMs);

  let rejectForInterruption: ((error: AgentModelInvocationInterrupted) => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    rejectForInterruption = reject;
  });
  const onProviderAbort = () => rejectForInterruption?.(new AgentModelInvocationInterrupted());
  providerController.signal.addEventListener("abort", onProviderAbort, { once: true });

  try {
    const providerResult = await Promise.race<AgentModelProviderResult>([
      Promise.resolve().then(() => provider.generateStructuredOutput({
        messages,
        egress,
        structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT,
        signal: providerController.signal,
        timeoutMs,
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      })),
      interruption,
    ]);
    const decision = parseAgentIntentDecision(providerResult.output);
    validateAgentIntentDecision(decision);
    return { decision, metadata: providerResult.metadata };
  } catch (error) {
    if (timedOut) throw new AgentModelError("AGENT_MODEL_TIMEOUT", { cause: error });
    if (externallyAborted) throw new AgentModelError("AGENT_MODEL_ABORTED", { cause: error });
    if (error instanceof AgentIntentShapeError) {
      throw new AgentModelError("AGENT_MODEL_INVALID_OUTPUT", { cause: error });
    }
    if (error instanceof AgentIntentContractError) {
      throw new AgentModelError("AGENT_MODEL_CONTRACT_VIOLATION", { cause: error });
    }
    throw new AgentModelError("AGENT_MODEL_PROVIDER_ERROR", { cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortProvider);
    providerController.signal.removeEventListener("abort", onProviderAbort);
  }
}
