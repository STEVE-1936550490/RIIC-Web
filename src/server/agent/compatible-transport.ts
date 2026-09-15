import OpenAI from "openai";
import { assertModelConfig, type ModelConfig } from "./compatible-config.ts";
import { AgentRunError } from "./run-contract.ts";

export type RequestBudget = { requests: number; maximum: number };
export type SafeProviderDiagnostic = Readonly<{
  category: "authentication_error" | "route_incompatibility" | "capability_incompatibility" | "configuration_error" | "provider_error" | "timeout" | "cancelled" | "redirect" | "response_format" | "continuation" | "tool_behavior" | "budget";
  httpStatus?: number;
  upstreamCode?: string;
  upstreamType?: string;
  rootCause: "UNRESOLVED";
  interruptReason?: "TRANSPORT_DEADLINE_EXCEEDED" | "CALLER_CANCELLED" | "UNKNOWN_INTERRUPT";
  continuation?: Readonly<{
    reason: "OPTIONAL_REASONING_EXTENSION" | "DEPRECATED_FUNCTION_CALL" | "MULTIPLE_UNSUPPORTED_CONTINUATION_SIGNALS";
    hasReasoningExtension: boolean;
    hasDeprecatedFunctionCall: boolean;
    reasoningExtensionKeys: readonly ("reasoning" | "reasoning_content" | "reasoning_details" | "audio")[];
  }>;
}>;
export class CompatibleProviderError extends AgentRunError {
  readonly diagnostic: SafeProviderDiagnostic;
  constructor(code: string, diagnostic: SafeProviderDiagnostic) {
    super(code); this.diagnostic = Object.freeze(diagnostic);
  }
}
// Never retain arbitrary upstream strings, messages, request IDs, headers or causes.
const safeTypes = new Set(["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error"]);
const safeCodes = new Set(["model_not_found", "invalid_model", "invalid_api_key", "unsupported_parameter", "unsupported_value", "unsupported_response_format", "invalid_request_error", "rate_limit_exceeded", "insufficient_quota"]);
export function safeCompatibleError(error: unknown, protocol: ModelConfig["protocol"]): AgentRunError {
  const prefix = protocol === "responses" ? "AGENT_RESPONSES_" : "AGENT_CHAT_";
  if (error instanceof AgentRunError) return error;
  if (error instanceof OpenAI.APIConnectionError && error.cause instanceof AgentRunError) return error.cause;
  if (error instanceof OpenAI.APIUserAbortError) return new CompatibleProviderError("AGENT_ABORTED", { category: "cancelled", rootCause: "UNRESOLVED", interruptReason: "UNKNOWN_INTERRUPT" });
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new CompatibleProviderError("AGENT_MODEL_TIMEOUT", { category: "timeout", rootCause: "UNRESOLVED", interruptReason: "TRANSPORT_DEADLINE_EXCEEDED" });
  if (error instanceof SyntaxError || error instanceof TypeError) return new AgentRunError(`${prefix}INVALID_RESPONSE`);
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const upstreamCode = typeof error.code === "string" && safeCodes.has(error.code) ? error.code : "UNKNOWN";
    const upstreamType = typeof error.type === "string" && safeTypes.has(error.type) ? error.type : "UNKNOWN";
    const category = status === 401 || status === 403 ? "authentication_error"
      : upstreamCode === "model_not_found" || upstreamCode === "invalid_model" ? "configuration_error"
      : status === 404 || status === 405 ? "route_incompatibility"
      : status === 400 || status === 422 ? "capability_incompatibility" : "provider_error";
    const suffix = category === "authentication_error" ? "AUTH_FAILED" : category === "configuration_error" ? "CONFIG_INVALID"
      : category === "route_incompatibility" ? "ROUTE_INCOMPATIBLE" : category === "capability_incompatibility" ? "CAPABILITY_INCOMPATIBLE"
      : status === 429 ? "RATE_LIMITED" : status && status >= 500 ? "SERVER_ERROR" : "NETWORK_ERROR";
    return new CompatibleProviderError(`${prefix}${suffix}`, { category, ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { httpStatus: status } : {}), upstreamCode, upstreamType, rootCause: "UNRESOLVED" });
  }
  return new AgentRunError(`${prefix}NETWORK_ERROR`);
}

/** Shared SDK client, exactly one configured route, no SDK environment headers or retries. */
export function createCompatibleClient(config: ModelConfig, fetcher: typeof fetch = fetch, budget?: RequestBudget) {
  assertModelConfig(config);
  const prefix = config.protocol === "responses" ? "AGENT_RESPONSES_" : "AGENT_CHAT_";
  const target = `${config.baseURL}/${config.protocol === "responses" ? "responses" : "chat/completions"}`;
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, organization: null, project: null, adminAPIKey: null, webhookSecret: null,
    maxRetries: 0, timeout: 15000, logLevel: "off", logger: { debug() {}, info() {}, warn() {}, error() {} },
    fetch: async (input, init) => {
      if (String(input) !== target || init?.method !== "POST") throw new AgentRunError(`${prefix}TARGET_REJECTED`);
      if (budget) {
        if (!Number.isInteger(budget.maximum) || budget.maximum < 1 || budget.maximum > 12 || !Number.isInteger(budget.requests) || budget.requests < 0 || budget.requests >= budget.maximum) throw new AgentRunError(`${prefix}REQUEST_BUDGET`);
        budget.requests++;
      }
      const headers = new Headers({ authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", accept: "application/json" });
      const response = await fetcher(input, { ...init, headers, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) throw new CompatibleProviderError(`${prefix}REDIRECT_REJECTED`, { category: "redirect", httpStatus: response.status, upstreamCode: "UNKNOWN", upstreamType: "UNKNOWN", rootCause: "UNRESOLVED" });
      if (response.ok && !response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new CompatibleProviderError(`${prefix}INVALID_RESPONSE`, { category: "response_format", httpStatus: response.status, upstreamCode: "UNKNOWN", upstreamType: "UNKNOWN", rootCause: "UNRESOLVED" });
      return response;
    },
  });
}

/** Fixed local categories for non-HTTP errors; never serialize arbitrary Error fields. */
export function diagnosticForError(error: AgentRunError): SafeProviderDiagnostic {
  if (error instanceof CompatibleProviderError) return error.diagnostic;
  const code = error.code;
  const category = /CONFIG|URL_INVALID|PROTOCOL_UNSUPPORTED|TARGET_REJECTED/.test(code) ? "configuration_error"
    : /AUTH_FAILED/.test(code) ? "authentication_error" : /TIMEOUT/.test(code) ? "timeout" : /ABORTED/.test(code) ? "cancelled"
    : /REDIRECT/.test(code) ? "redirect" : /CONTINUATION/.test(code) ? "continuation"
    : /BUDGET|LIMIT/.test(code) ? "budget" : /INVALID_RESPONSE|INCOMPLETE|REFUSAL|INVALID_OUTPUT|INVALID_INPUT/.test(code) ? "response_format"
    : /TOOL|HISTORY|ALIAS|FACT_MISMATCH/.test(code) ? "tool_behavior" : "provider_error";
  return { category, upstreamCode: "UNKNOWN", upstreamType: "UNKNOWN", rootCause: "UNRESOLVED" };
}

/** A supplied signal is owned by the caller; never inspect or retain its arbitrary reason. */
export function callerCancellationError(): CompatibleProviderError {
  return new CompatibleProviderError("AGENT_ABORTED", {
    category: "cancelled", rootCause: "UNRESOLVED", interruptReason: "CALLER_CANCELLED",
  });
}

/** Covers SDK response-body consumption too; the SDK's own timer ends at headers. */
export async function withCompatibleDeadline<T>(
  options: { signal: AbortSignal; timeout: number; maxRetries: 0 },
  work: (options: { signal: AbortSignal; timeout: number; maxRetries: 0 }) => Promise<T>,
): Promise<T> {
  if (options.signal.aborted) throw callerCancellationError();
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
  const timeout = Math.min(options.timeout, 15000);
  const controller = new AbortController();
  const deadlineError = () => new CompatibleProviderError("AGENT_MODEL_TIMEOUT", {
    category: "timeout", rootCause: "UNRESOLVED", interruptReason: "TRANSPORT_DEADLINE_EXCEEDED",
  });
  let expired = false;
  let rejectInterrupt!: (error: AgentRunError) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject; });
  const cancel = () => { rejectInterrupt(callerCancellationError()); controller.abort(); };
  options.signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { expired = true; rejectInterrupt(deadlineError()); controller.abort(); }, timeout);
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw options.signal.aborted ? callerCancellationError() : deadlineError();
      return work({ signal: controller.signal, timeout, maxRetries: 0 });
    }), interrupted]);
  } catch (error) {
    if (options.signal.aborted) throw callerCancellationError();
    if (expired) throw deadlineError();
    throw error;
  } finally { clearTimeout(timer); options.signal.removeEventListener("abort", cancel); }
}
