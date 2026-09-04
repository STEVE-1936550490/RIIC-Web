import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_INTENT_DECISION_OUTPUT_CONTRACT,
  type AgentIntentDecision,
} from "./intent-contract.ts";
import {
  AGENT_INTENT_CLASSIFICATION_INSTRUCTION,
  createAgentIntentMessages,
} from "./intent-prompt.ts";
import { AgentModelError, callStructuredAgentIntent } from "./model-client.ts";
import {
  OpenAIModelProvider,
  type OpenAIResponseEnvelope,
  type OpenAIResponseOptions,
  type OpenAIResponseRequest,
  type OpenAIResponsesTransport,
} from "./openai-model-provider.ts";

const validDecision: AgentIntentDecision = {
  intent: "get_room_detail",
  roomRef: "贸易站 1",
  leftPlanRef: null,
  rightPlanRef: null,
  missingFields: [],
  canProceed: true,
};

type RecordedCall = {
  request: OpenAIResponseRequest;
  options: OpenAIResponseOptions;
};

class StubOpenAIResponsesTransport implements OpenAIResponsesTransport {
  readonly calls: RecordedCall[] = [];
  private readonly handler: (
    request: OpenAIResponseRequest,
    options: OpenAIResponseOptions,
  ) => Promise<OpenAIResponseEnvelope>;

  constructor(handler: StubOpenAIResponsesTransport["handler"]) {
    this.handler = handler;
  }

  async create(
    request: OpenAIResponseRequest,
    options: OpenAIResponseOptions,
  ): Promise<OpenAIResponseEnvelope> {
    this.calls.push({ request, options });
    return this.handler(request, options);
  }
}

function successfulTransport(
  envelope: Partial<OpenAIResponseEnvelope> = {},
): StubOpenAIResponsesTransport {
  return new StubOpenAIResponsesTransport(async () => ({
    outputText: JSON.stringify(validDecision),
    model: "gpt-test-response",
    ...envelope,
  }));
}

test("maps the provider-neutral request to strict Responses API Structured Outputs", async () => {
  const transport = successfulTransport();
  const provider = new OpenAIModelProvider({ model: " gpt-test-request ", transport });
  const controller = new AbortController();
  const messages = createAgentIntentMessages("看看贸易站 1 的情况");

  await provider.generateStructuredOutput({
    messages,
    structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT,
    signal: controller.signal,
    timeoutMs: 4_000,
    maxOutputTokens: 192,
  });

  assert.equal(transport.calls.length, 1);
  const call = transport.calls[0];
  assert.ok(call);
  assert.deepEqual(call.request.input, messages);
  assert.equal(call.request.model, "gpt-test-request");
  assert.equal(call.request.store, false);
  assert.equal(call.request.max_output_tokens, 192);
  assert.equal(call.request.text.format.type, "json_schema");
  assert.equal(call.request.text.format.name, AGENT_INTENT_DECISION_OUTPUT_CONTRACT.name);
  assert.equal(call.request.text.format.schema, AGENT_INTENT_DECISION_OUTPUT_CONTRACT.schema);
  assert.equal(call.request.text.format.strict, true);
  assert.deepEqual(call.options, {
    signal: controller.signal,
    timeout: 4_000,
    maxRetries: 0,
  });
  assert.equal("tools" in call.request, false);
});

test("returns unknown provider output and maps only provider-neutral metadata", async () => {
  const transport = successfulTransport({
    requestId: "req_openai_123",
    usage: { inputTokens: 11, outputTokens: 13, totalTokens: 24 },
  });
  const timestamps = [100, 107];
  const provider = new OpenAIModelProvider({
    model: "gpt-test-request",
    transport,
    now: () => timestamps.shift() ?? 107,
  });

  const result = await callStructuredAgentIntent({
    provider,
    messages: createAgentIntentMessages("看看贸易站 1 的情况"),
    timeoutMs: 1_000,
  });

  assert.deepEqual(result.decision, validDecision);
  assert.equal("provider" in result.decision, false);
  assert.equal("model" in result.decision, false);
  assert.equal("usage" in result.decision, false);
  assert.deepEqual(result.metadata, {
    provider: "openai",
    model: "gpt-test-response",
    providerRequestId: "req_openai_123",
    usage: { inputTokens: 11, outputTokens: 13, totalTokens: 24 },
    latencyMs: 7,
  });
});

test("propagates the model-client AbortSignal to the OpenAI request", async () => {
  let observedSignal: AbortSignal | undefined;
  const transport = new StubOpenAIResponsesTransport((_request, options) => {
    observedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  });
  const provider = new OpenAIModelProvider({ model: "gpt-test", transport });
  const controller = new AbortController();
  const call = callStructuredAgentIntent({
    provider,
    messages: createAgentIntentMessages("解释一下当前排班方案"),
    timeoutMs: 1_000,
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();

  await assert.rejects(call, (error: unknown) => {
    assert.ok(error instanceof AgentModelError);
    assert.equal(error.code, "AGENT_MODEL_ABORTED");
    return true;
  });
  assert.equal(observedSignal?.aborted, true);
});

test("keeps the shared timeout code while aborting the in-flight OpenAI request", async () => {
  let observedOptions: OpenAIResponseOptions | undefined;
  const transport = new StubOpenAIResponsesTransport((_request, options) => {
    observedOptions = options;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("timed out", "AbortError")),
        { once: true },
      );
    });
  });
  const provider = new OpenAIModelProvider({ model: "gpt-test", transport });

  await assert.rejects(
    callStructuredAgentIntent({
      provider,
      messages: createAgentIntentMessages("解释一下当前排班方案"),
      timeoutMs: 20,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AgentModelError);
      assert.equal(error.code, "AGENT_MODEL_TIMEOUT");
      return true;
    },
  );
  assert.equal(observedOptions?.timeout, 20);
  assert.equal(observedOptions?.signal.aborted, true);
});

test("normalizes authentication and rate-limit failures without exposing SDK details", async (t) => {
  for (const providerFailure of [
    new Error("401 raw response with secret headers"),
    new Error("429 raw response with account details"),
  ]) {
    await t.test(providerFailure.message.slice(0, 3), async () => {
      const transport = new StubOpenAIResponsesTransport(async () => {
        throw providerFailure;
      });
      const provider = new OpenAIModelProvider({ model: "gpt-test", transport });

      await assert.rejects(
        callStructuredAgentIntent({
          provider,
          messages: createAgentIntentMessages("解释一下当前排班方案"),
          timeoutMs: 1_000,
        }),
        (error: unknown) => {
          assert.ok(error instanceof AgentModelError);
          assert.equal(error.code, "AGENT_MODEL_PROVIDER_ERROR");
          assert.equal(error.message.includes(providerFailure.message), false);
          assert.ok(error.cause instanceof Error);
          assert.equal(error.cause.message.includes(providerFailure.message), false);
          return true;
        },
      );
    });
  }
});

test("leaves malformed JSON for the shared local invalid-output boundary", async () => {
  const provider = new OpenAIModelProvider({
    model: "gpt-test",
    transport: successfulTransport({ outputText: "not-json" }),
  });

  await assert.rejects(
    callStructuredAgentIntent({
      provider,
      messages: createAgentIntentMessages("解释一下当前排班方案"),
      timeoutMs: 1_000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AgentModelError);
      assert.equal(error.code, "AGENT_MODEL_INVALID_OUTPUT");
      return true;
    },
  );
});

test("keeps the narrow classifier instruction separate from the adapter", () => {
  const messages = createAgentIntentMessages("比较方案 A 和方案 B");

  assert.deepEqual(messages, [
    { role: "system", content: AGENT_INTENT_CLASSIFICATION_INSTRUCTION },
    { role: "user", content: "比较方案 A 和方案 B" },
  ]);
  assert.match(AGENT_INTENT_CLASSIFICATION_INSTRUCTION, /不要调用工具/);
  assert.match(AGENT_INTENT_CLASSIFICATION_INSTRUCTION, /不要回答业务问题/);
  assert.match(AGENT_INTENT_CLASSIFICATION_INSTRUCTION, /不要把显示名称猜成 roomId/);
  assert.match(AGENT_INTENT_CLASSIFICATION_INSTRUCTION, /不要把方案标题猜成数据库 id/);
});
