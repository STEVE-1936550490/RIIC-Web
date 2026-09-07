import { assertModelEgress } from "./egress-policy.ts";
import { AgentRunError } from "./run-contract.ts";
import { readResponsesConfig, type ResponsesEnvironment, type ResponsesConfig } from "./responses-config.ts";
import { createResponsesTransport } from "./responses-transport.ts";

import type {
  AgentModelProvider,
  AgentModelProviderResult,
  AgentModelRequest,
} from "./model-provider.ts";

export type OpenAIResponseRequest = {
  model: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      schema: Readonly<Record<string, unknown>>;
      strict: true;
    };
  };
  store: false;
  max_output_tokens?: number;
};

export type OpenAIResponseOptions = {
  signal: AbortSignal;
  timeout: number;
  maxRetries: 0;
};

export type OpenAIResponseEnvelope = {
  outputText: string;
  model?: string;
  requestId?: string;
  usage?: import("./model-provider.ts").AgentModelUsage;
};

export interface OpenAIResponsesTransport {
  create(
    request: OpenAIResponseRequest,
    options: OpenAIResponseOptions,
  ): Promise<OpenAIResponseEnvelope>;
}

class OpenAIProviderInvocationError extends Error {
  constructor() {
    super("Responses compatible provider invocation failed.");
    this.name = "OpenAIProviderInvocationError";
  }
}

export type OpenAIModelProviderOptions = {
  model: string;
  transport: OpenAIResponsesTransport;
  now?: () => number;
};

export class OpenAIModelProvider implements AgentModelProvider {
  readonly kind = "external";
  private readonly model: string;
  private readonly transport: OpenAIResponsesTransport;
  private readonly now: () => number;

  constructor({ model, transport, now = performance.now.bind(performance) }: OpenAIModelProviderOptions) {
    const normalizedModel = model.trim();
    if (!normalizedModel) throw new AgentRunError("AGENT_RESPONSES_CONFIG_MISSING");
    this.model = normalizedModel;
    this.transport = transport;
    this.now = now;
  }

  async generateStructuredOutput(request: AgentModelRequest): Promise<AgentModelProviderResult> {
    assertModelEgress("external", request.egress ?? { classification: "user_business_context", localTestApproved: false });
    request.signal.throwIfAborted();
    const startedAt = this.now();
    const openAIRequest: OpenAIResponseRequest = {
      model: this.model,
      input: request.messages.map(({ role, content }) => ({ role, content })),
      text: {
        format: {
          type: "json_schema",
          name: request.structuredOutput.name,
          schema: request.structuredOutput.schema,
          strict: true,
        },
      },
      store: false,
    };
    if (request.maxOutputTokens !== undefined) {
      openAIRequest.max_output_tokens = request.maxOutputTokens;
    }

    let response: OpenAIResponseEnvelope;
    try {
      response = await this.transport.create(openAIRequest, {
        signal: request.signal,
        timeout: request.timeoutMs,
        maxRetries: 0,
      });
    } catch (error) {
      if (error instanceof AgentRunError) throw error;
      throw new OpenAIProviderInvocationError();
    }

    let output: unknown = response.outputText;
    try {
      output = JSON.parse(response.outputText);
    } catch {
      // Keep malformed text as unknown so the shared local parser owns invalid-output handling.
    }

    const metadata: AgentModelProviderResult["metadata"] = {
      provider: "responses_compatible",
      model: response.model,
      latencyMs: Math.max(0, this.now() - startedAt),
    };
    if (response.requestId) metadata.providerRequestId = response.requestId;
    if (response.usage) metadata.usage = response.usage;

    return { output, metadata };
  }
}

export function createResponsesModelProvider(config: ResponsesConfig, transport = createResponsesTransport(config)): OpenAIModelProvider {
  return new OpenAIModelProvider({ model: config.model, transport: { async create(request, options) {
    const data = await transport.create(request, options);
    if (data.output.some((item) => item.type === "function_call")) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
    const outputText = data.output.flatMap((item) => item.type === "message" ? item.content.flatMap((c) => c.type === "output_text" ? [c.text] : []) : []).join("\n");
    if (!outputText.trim()) throw new AgentRunError("AGENT_RESPONSES_INVALID_RESPONSE");
    return { outputText, model: data.model, usage: data.usage };
  } } });
}
/** Historical export; uses only the new explicit compatible configuration. */
export function createOpenAIModelProviderFromEnv(environment: ResponsesEnvironment = process.env): OpenAIModelProvider {
  return createResponsesModelProvider(readResponsesConfig(environment));
}
