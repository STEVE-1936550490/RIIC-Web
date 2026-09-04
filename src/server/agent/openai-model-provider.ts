import OpenAI from "openai";

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
  model: string;
  requestId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export interface OpenAIResponsesTransport {
  create(
    request: OpenAIResponseRequest,
    options: OpenAIResponseOptions,
  ): Promise<OpenAIResponseEnvelope>;
}

export type OpenAIModelConfigurationErrorCode =
  | "AGENT_OPENAI_API_KEY_MISSING"
  | "AGENT_OPENAI_MODEL_MISSING";

export class OpenAIModelConfigurationError extends Error {
  readonly code: OpenAIModelConfigurationErrorCode;

  constructor(code: OpenAIModelConfigurationErrorCode) {
    const message = code === "AGENT_OPENAI_API_KEY_MISSING"
      ? "OPENAI_API_KEY 未配置。"
      : "AGENT_OPENAI_MODEL 未配置。";
    super(message);
    this.name = "OpenAIModelConfigurationError";
    this.code = code;
  }
}

class OpenAIProviderInvocationError extends Error {
  constructor() {
    super("OpenAI Responses API 调用失败。");
    this.name = "OpenAIProviderInvocationError";
  }
}

class OpenAISdkResponsesTransport implements OpenAIResponsesTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async create(
    request: OpenAIResponseRequest,
    options: OpenAIResponseOptions,
  ): Promise<OpenAIResponseEnvelope> {
    const { data, request_id: requestId } = await this.client.responses
      .create(request, options)
      .withResponse();

    const envelope: OpenAIResponseEnvelope = {
      outputText: data.output_text,
      model: data.model,
    };
    if (requestId) envelope.requestId = requestId;
    if (data.usage) {
      envelope.usage = {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.total_tokens,
      };
    }
    return envelope;
  }
}

export type OpenAIModelProviderOptions = {
  model: string;
  transport: OpenAIResponsesTransport;
  now?: () => number;
};

export class OpenAIModelProvider implements AgentModelProvider {
  private readonly model: string;
  private readonly transport: OpenAIResponsesTransport;
  private readonly now: () => number;

  constructor({ model, transport, now = performance.now.bind(performance) }: OpenAIModelProviderOptions) {
    const normalizedModel = model.trim();
    if (!normalizedModel) throw new OpenAIModelConfigurationError("AGENT_OPENAI_MODEL_MISSING");
    this.model = normalizedModel;
    this.transport = transport;
    this.now = now;
  }

  async generateStructuredOutput(request: AgentModelRequest): Promise<AgentModelProviderResult> {
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
    } catch {
      throw new OpenAIProviderInvocationError();
    }

    let output: unknown = response.outputText;
    try {
      output = JSON.parse(response.outputText);
    } catch {
      // Keep malformed text as unknown so the shared local parser owns invalid-output handling.
    }

    const metadata: AgentModelProviderResult["metadata"] = {
      provider: "openai",
      model: response.model,
      latencyMs: Math.max(0, this.now() - startedAt),
    };
    if (response.requestId) metadata.providerRequestId = response.requestId;
    if (response.usage) metadata.usage = response.usage;

    return { output, metadata };
  }
}

export type OpenAIProviderEnvironment = {
  OPENAI_API_KEY?: string;
  AGENT_OPENAI_MODEL?: string;
};

export function createOpenAIModelProviderFromEnv(
  environment: OpenAIProviderEnvironment = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AGENT_OPENAI_MODEL: process.env.AGENT_OPENAI_MODEL,
  },
): OpenAIModelProvider {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIModelConfigurationError("AGENT_OPENAI_API_KEY_MISSING");

  const model = environment.AGENT_OPENAI_MODEL?.trim();
  if (!model) throw new OpenAIModelConfigurationError("AGENT_OPENAI_MODEL_MISSING");

  return new OpenAIModelProvider({
    model,
    transport: new OpenAISdkResponsesTransport(apiKey),
  });
}
