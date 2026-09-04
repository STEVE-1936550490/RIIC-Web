import assert from "node:assert/strict";
import test from "node:test";

import { FakeAgentModelProvider } from "./fake-model-provider.ts";
import { AGENT_INTENT_DECISION_OUTPUT_CONTRACT } from "./intent-contract.ts";
import {
  AgentModelError,
  callStructuredAgentIntent,
  type AgentModelErrorCode,
} from "./model-client.ts";
import type { AgentModelRequest } from "./model-provider.ts";

const validOutput = {
  intent: "get_room_detail",
  roomRef: "会客室",
  leftPlanRef: null,
  rightPlanRef: null,
  missingFields: [],
  canProceed: true,
};

const messages = [{ role: "user", content: "会客室里是谁？" }] as const;

async function expectModelError(promise: Promise<unknown>, code: AgentModelErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AgentModelError);
    assert.equal(error.code, code);
    return true;
  });
}

test("returns a validated decision and keeps provider metadata separate", async () => {
  const provider = new FakeAgentModelProvider({
    kind: "success",
    output: validOutput,
    metadata: {
      providerRequestId: "fake-request-1",
      usage: { inputTokens: 12, outputTokens: 24, totalTokens: 36 },
      latencyMs: 7,
    },
  });

  const result = await callStructuredAgentIntent({
    provider,
    messages,
    timeoutMs: 1_000,
    maxOutputTokens: 128,
  });

  assert.deepEqual(result.decision, validOutput);
  assert.equal("providerRequestId" in result.decision, false);
  assert.equal("usage" in result.decision, false);
  assert.deepEqual(result.metadata, {
    providerRequestId: "fake-request-1",
    usage: { inputTokens: 12, outputTokens: 24, totalTokens: 36 },
    latencyMs: 7,
  });
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0]?.structuredOutput, AGENT_INTENT_DECISION_OUTPUT_CONTRACT);
  assert.equal(provider.requests[0]?.timeoutMs, 1_000);
  assert.equal(provider.requests[0]?.maxOutputTokens, 128);
  assert.deepEqual(provider.requests[0]?.messages, messages);
});

test("normalizes provider errors without exposing provider details in the message", async () => {
  const provider = new FakeAgentModelProvider({
    kind: "provider-error",
    error: new Error("secret provider response body"),
  });
  const promise = callStructuredAgentIntent({ provider, messages, timeoutMs: 1_000 });

  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AgentModelError);
    assert.equal(error.code, "AGENT_MODEL_PROVIDER_ERROR");
    assert.equal(error.message.includes("secret provider response body"), false);
    return true;
  });
});

test("times out a provider that never settles and aborts its request signal", async () => {
  const provider = new FakeAgentModelProvider({ kind: "timeout" });
  await expectModelError(
    callStructuredAgentIntent({ provider, messages, timeoutMs: 20 }),
    "AGENT_MODEL_TIMEOUT",
  );
  assert.equal(provider.requests[0]?.signal.aborted, true);
});

test("rejects an already-aborted call before invoking the provider", async () => {
  const controller = new AbortController();
  controller.abort(new Error("private abort reason"));
  const provider = new FakeAgentModelProvider({ kind: "success", output: validOutput });

  await expectModelError(
    callStructuredAgentIntent({ provider, messages, timeoutMs: 1_000, signal: controller.signal }),
    "AGENT_MODEL_ABORTED",
  );
  assert.equal(provider.requests.length, 0);
});

test("propagates cancellation while a provider call is in flight", async () => {
  const controller = new AbortController();
  const provider = new FakeAgentModelProvider({ kind: "timeout" });
  const call = callStructuredAgentIntent({
    provider,
    messages,
    timeoutMs: 1_000,
    signal: controller.signal,
  });
  controller.abort();

  await expectModelError(call, "AGENT_MODEL_ABORTED");
  assert.equal(provider.requests[0]?.signal.aborted, true);
});

test("fake provider honors an already-aborted provider request", async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = new FakeAgentModelProvider({ kind: "success", output: validOutput });
  const request: AgentModelRequest = {
    messages,
    structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT,
    signal: controller.signal,
    timeoutMs: 1_000,
  };

  await assert.rejects(provider.generateStructuredOutput(request), { name: "AbortError" });
});

test("normalizes shape-invalid output separately from semantic violations", async () => {
  const shapeInvalidProvider = new FakeAgentModelProvider({
    kind: "shape-invalid",
    output: { ...validOutput, unexpected: true },
  });
  await expectModelError(
    callStructuredAgentIntent({ provider: shapeInvalidProvider, messages, timeoutMs: 1_000 }),
    "AGENT_MODEL_INVALID_OUTPUT",
  );

  const semanticInvalidProvider = new FakeAgentModelProvider({
    kind: "semantic-invalid",
    output: { ...validOutput, roomRef: null, canProceed: true },
  });
  await expectModelError(
    callStructuredAgentIntent({ provider: semanticInvalidProvider, messages, timeoutMs: 1_000 }),
    "AGENT_MODEL_CONTRACT_VIOLATION",
  );
});
