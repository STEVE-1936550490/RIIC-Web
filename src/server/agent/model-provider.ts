export type AgentModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentStructuredOutputContract = {
  name: string;
  schema: Readonly<Record<string, unknown>>;
};

export type AgentModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AgentModelMetadata = {
  provider?: string;
  model?: string;
  providerRequestId?: string;
  usage?: AgentModelUsage;
  latencyMs?: number;
};

export type AgentModelRequest = {
  /** Server-owned; omitted means business context, never synthetic. */
  egress?: import("./egress-policy.ts").EgressContext;
  messages: readonly AgentModelMessage[];
  structuredOutput: AgentStructuredOutputContract;
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputTokens?: number;
};

export type AgentModelProviderResult = {
  output: unknown;
  metadata: AgentModelMetadata;
};

export interface AgentModelProvider {
  generateStructuredOutput(request: AgentModelRequest): Promise<AgentModelProviderResult>;
}
