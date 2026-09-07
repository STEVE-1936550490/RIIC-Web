import assert from "node:assert/strict";
import test from "node:test";
import { readResponsesConfig, missingResponsesConfig } from "./responses-config.ts";
import { createResponsesTransport } from "./responses-transport.ts";
import { createResponsesModelProvider, createOpenAIModelProviderFromEnv } from "./openai-model-provider.ts";
import { createResponsesLoopProvider, createSyntheticOpenAILoopProvider } from "./openai-loop-provider.ts";
import { callStructuredAgentIntent } from "./model-client.ts";
import { createAgentIntentMessages } from "./intent-prompt.ts";
import { AGENT_INTENT_DECISION_OUTPUT_CONTRACT } from "./intent-contract.ts";
import { syntheticEgress, syntheticExecution } from "./m3-test-support.ts";
import { record } from "./run-contract.ts";
const { visibleTools } = await import("./tool-registry.ts");
const env = { AGENT_MODEL_PROTOCOL: "responses", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/custom/v1/", AGENT_MODEL_API_KEY: "synthetic-test-key", AGENT_MODEL_ID: "vendor/test-model" };
const message = (text = "synthetic answer") => ({ type: "message", id: "msg-1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
const call = (id = "call-1", name = "current_plan__get_summary", args = "{}") => ({ type: "function_call", id: `item-${id}`, call_id: id, name, arguments: args });
const response = (output: unknown[] = [message()], extra: Record<string, unknown> = {}) => ({ id: "response-1", object: "response", status: "completed", output, model: "reported-model", ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const options = () => ({ signal: new AbortController().signal, timeout: 1000, maxRetries: 0 as const });
const req = () => ({ runId: "run-1", message: "synthetic", tools: visibleTools(syntheticExecution()), observations: [], signal: new AbortController().signal, egress: syntheticEgress });
function harness(outputs: unknown[], overrides: Record<string, string> = {}) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers; redirect?: RequestRedirect }[] = [];
  const config = readResponsesConfig({ ...env, ...overrides });
  const transport = createResponsesTransport(config, async (url, init) => {
    requests.push({ url: String(url), body: record(JSON.parse(String(init?.body))), headers: new Headers(init?.headers), redirect: init?.redirect });
    return json(outputs.shift());
  });
  return { requests, config, transport };
}

test("configuration fails closed, preserves prefixes and never borrows legacy variables", () => {
  for (const key of Object.keys(env)) {
    const value = { ...env, [key]: "", OPENAI_API_KEY: "legacy", OPENAI_BASE_URL: "https://api.openai.com/v1", AGENT_OPENAI_MODEL: "legacy" };
    assert.deepEqual(missingResponsesConfig(value), [key]); assert.throws(() => readResponsesConfig(value), { code: "AGENT_RESPONSES_CONFIG_MISSING" });
  }
  assert.throws(() => createOpenAIModelProviderFromEnv({ OPENAI_API_KEY: "legacy" }), { code: "AGENT_RESPONSES_CONFIG_MISSING" });
  assert.throws(() => createSyntheticOpenAILoopProvider({ OPENAI_API_KEY: "legacy" }), { code: "AGENT_RESPONSES_CONFIG_MISSING" });
  for (const url of ["not-url", "https:example.invalid", "https://@example.invalid/v1", "https://u:p@example.invalid/v1", "https://example.invalid/v1?key=x", "https://example.invalid/v1#x", "https://example.invalid/v1/responses/", "http://example.invalid/v1", "https://api.openai.com/v1", "https://api.openai.com./v1"]) {
    assert.throws(() => readResponsesConfig({ ...env, AGENT_MODEL_BASE_URL: url }), { code: "AGENT_RESPONSES_URL_INVALID" });
  }
  assert.throws(() => readResponsesConfig({ ...env, AGENT_MODEL_PROTOCOL: "chat_completions" }), { code: "AGENT_RESPONSES_PROTOCOL_UNSUPPORTED" });
  assert.throws(() => readResponsesConfig({ ...env, AGENT_MODEL_REASONING_CONTINUATION: "auto" }));
  assert.throws(() => readResponsesConfig({ ...env, AGENT_MODEL_BASE_URL: "http://localhost:9999/v1" }));
  assert.equal(readResponsesConfig({ ...env, AGENT_MODEL_BASE_URL: "http://127.0.0.1:9999/custom", APP_DEPLOYMENT_ENV: "development", AGENT_MODEL_ALLOW_LOOPBACK_HTTP: "1" }).baseURL, "http://127.0.0.1:9999/custom");
});

test("real SDK URL/body/header mapping, strict M1 schema, no global SDK configuration pollution", async () => {
  const keys = ["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID", "OPENAI_ADMIN_KEY", "OPENAI_LOG", "OPENAI_CUSTOM_HEADERS"];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) process.env[key] = key === "OPENAI_LOG" ? "debug" : "unrelated-value";
    process.env.OPENAI_CUSTOM_HEADERS = "Authorization: Bearer unrelated-value\nCookie: unrelated-value\nX-Tenant: unrelated-value";
    const decision = { intent: "get_room_detail", roomRef: "贸易站 1", leftPlanRef: null, rightPlanRef: null, missingFields: [], canProceed: true };
    for (const prefix of ["https://gateway.example.invalid/v1", "https://gateway.example.invalid/custom/root/"]) {
      const h = harness([response([message(JSON.stringify(decision))])], { AGENT_MODEL_BASE_URL: prefix });
      const result = await callStructuredAgentIntent({ provider: createResponsesModelProvider(h.config, h.transport), messages: createAgentIntentMessages("看看贸易站 1"), timeoutMs: 1000, egress: syntheticEgress });
      assert.deepEqual(result.decision, decision); assert.equal(result.metadata.provider, "responses_compatible"); assert.equal(result.metadata.usage, undefined);
      const sent = h.requests[0]; assert.equal(sent.url, prefix.replace(/\/$/, "") + "/responses");
      assert.equal(sent.redirect, "manual"); assert.equal(sent.headers.get("authorization"), "Bearer synthetic-test-key");
      assert.equal(sent.headers.has("openai-organization"), false); assert.equal(sent.headers.has("openai-project"), false);
      assert.equal(sent.headers.has("cookie"), false); assert.equal(sent.headers.has("x-tenant"), false);
      assert.equal(sent.body.model, env.AGENT_MODEL_ID); assert.equal(sent.body.store, false);
      assert.deepEqual(record(sent.body.text).format, { type: "json_schema", name: AGENT_INTENT_DECISION_OUTPUT_CONTRACT.name, schema: AGENT_INTENT_DECISION_OUTPUT_CONTRACT.schema, strict: true });
    }
  } finally { keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
});

test("SDK multiple calls, aliases, call_id (not item.id), ordered private continuation and no duplicate outputs", async () => {
  const reasoning = { type: "reasoning", id: "reason-1", summary: [], encrypted_content: "synthetic-opaque-continuation" };
  const h = harness([response([reasoning, { ...message("checking"), phase: "commentary" }, call(), call("call-2", "current_plan__get_room_detail", '{"roomRef":"trade_1","shiftIndex":null}')]), response([call("call-3", "saved_plan__list", '{"query":null}')]), response()], { AGENT_MODEL_REASONING_CONTINUATION: "encrypted" });
  const provider = createResponsesLoopProvider(h.config, h.transport); const request = req();
  const first = await provider.next(request); assert.equal(first.decision.type, "calls");
  if (first.decision.type !== "calls") throw new Error();
  assert.equal(first.decision.calls.length, 2);
  const observations = first.decision.calls.map((call) => ({ call, result: { status: "ok" } }));
  const second = await provider.next({ ...request, observations });
  if (second.decision.type !== "calls") throw new Error();
  await provider.next({ ...request, observations: [...observations, { call: second.decision.calls[0], result: { status: "empty" } }] });
  const input = h.requests[2].body.input as Record<string, unknown>[];
  assert.deepEqual(input.slice(2, 6).map((i) => i.type), ["reasoning", "message", "function_call", "function_call"]);
  assert.equal(input[3].phase, "commentary");
  assert.deepEqual(input.filter((i) => i.type === "function_call_output").map((i) => i.call_id), ["call-1", "call-2", "call-3"]);
  assert.deepEqual(h.requests[0].body.include, ["reasoning.encrypted_content"]);
  assert.equal("previous_response_id" in h.requests[0].body, false);
  const tools = h.requests[0].body.tools as Record<string, unknown>[];
  assert.equal(new Set(tools.map((t) => t.name)).size, 4); assert.ok(tools.every((t) => t.strict === true));
  await assert.rejects(provider.next(request), { code: "AGENT_RESPONSES_RUN_REUSE" });
});

test("run isolation, incomplete result refill, malformed args, duplicate IDs and unknown aliases fail closed", async () => {
  for (const output of [[call("c", "unknown")], [call("c", "current_plan__get_summary", "{")], [call(), call()]]) {
    const h = harness([response(output)]); await assert.rejects(createResponsesLoopProvider(h.config, h.transport).next(req()));
  }
  const h = harness([response([call()]), response()]); const provider = createResponsesLoopProvider(h.config, h.transport);
  await provider.next(req());
  await assert.rejects(provider.next({ ...req(), runId: "other-run" }), { code: "AGENT_RESPONSES_RUN_REUSE" });
  await assert.rejects(provider.next(req()), { code: "AGENT_RESPONSES_HISTORY_INVALID" });
  const fresh = createResponsesLoopProvider(h.config, h.transport); await fresh.next({ ...req(), runId: "fresh" });
  assert.equal((h.requests[1].body.input as unknown[]).length, 2); assert.equal("include" in h.requests[1].body, false);
});

test("completion/refusal/continuation capability errors and malformed envelopes", async () => {
  for (const [body, code] of [
    [response([], { status: "incomplete" }), "AGENT_RESPONSES_INCOMPLETE"],
    [response([], { status: "failed" }), "AGENT_RESPONSES_FAILED"],
    [response([]), "AGENT_RESPONSES_INVALID_RESPONSE"],
    [{ object: "response" }, "AGENT_RESPONSES_INVALID_RESPONSE"],
    [response([{ ...call(), status: "in_progress" }]), "AGENT_RESPONSES_INCOMPLETE"],
    [response([{ ...message(), content: [{ type: "refusal", refusal: "no" }] }]), "AGENT_RESPONSES_REFUSAL"],
    [response([{ type: "reasoning", id: "r", summary: [] }]), "AGENT_RESPONSES_CONTINUATION_UNSUPPORTED"],
  ] as const) {
    const h = harness([body]); await assert.rejects(h.transport.create({ model: "ignored", input: "synthetic" }, options()), { code });
  }
  const h = harness([response([{ type: "reasoning", id: "r", summary: [], encrypted_content: "opaque" }])]);
  await assert.rejects(h.transport.create({ model: "ignored", input: "synthetic" }, options()), { code: "AGENT_RESPONSES_CONTINUATION_UNSUPPORTED" });
});

test("HTTP failures are sanitized; redirects, HTML and hidden retries rejected", async () => {
  for (const [status, suffix] of [[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [404, "CAPABILITY_INCOMPATIBLE"], [400, "CAPABILITY_INCOMPATIBLE"], [429, "RATE_LIMITED"], [500, "SERVER_ERROR"], [503, "SERVER_ERROR"], [302, "REDIRECT_REJECTED"]] as const) {
    let calls = 0; const transport = createResponsesTransport(readResponsesConfig(env), async () => { calls++; return new Response("secret raw HTML", { status, headers: { location: "https://api.openai.com/v1/responses" } }); });
    await assert.rejects(transport.create({ model: "ignored", input: "synthetic" }, options()), (error: unknown) => {
      assert.equal(record(error).code, `AGENT_RESPONSES_${suffix}`); assert.ok(!String(error).includes("secret")); assert.equal(record(error).cause, undefined); return true;
    }); assert.equal(calls, 1);
  }
  const transport = createResponsesTransport(readResponsesConfig(env), async () => new Response("<html>bad</html>"));
  await assert.rejects(transport.create({ model: "ignored", input: "synthetic" }, options()), { code: "AGENT_RESPONSES_INVALID_RESPONSE" });
  const malformed = createResponsesTransport(readResponsesConfig(env), async () => new Response("{", { headers: { "content-type": "application/json" } }));
  await assert.rejects(malformed.create({ model: "ignored", input: "synthetic" }, options()), { code: "AGENT_RESPONSES_INVALID_RESPONSE" });
});

test("SDK timeout, abort and global 12-request budget", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => { calls++; return new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); }); };
  const transport = createResponsesTransport(readResponsesConfig(env), fetcher);
  await assert.rejects(transport.create({ model: "ignored", input: "synthetic" }, { ...options(), timeout: 15 }), { code: "AGENT_MODEL_TIMEOUT" }); assert.equal(calls, 1);
  const controller = new AbortController(); const pending = transport.create({ model: "ignored", input: "synthetic" }, { ...options(), signal: controller.signal });
  setTimeout(() => controller.abort(), 10); await assert.rejects(pending, { code: "AGENT_ABORTED" });
  const budget = { requests: 12, maximum: 12 };
  const limited = createResponsesTransport(readResponsesConfig(env), async () => { throw new Error("must not fetch"); }, budget);
  await assert.rejects(limited.create({ model: "ignored", input: "synthetic" }, options()), { code: "AGENT_RESPONSES_REQUEST_BUDGET" });
});

test("M1/M3 external egress blocks initial and subsequent business calls before HTTP", async () => {
  const h = harness([response([call()])]); const provider = createResponsesLoopProvider(h.config, h.transport);
  const business = { classification: "user_business_context" as const, localTestApproved: true };
  await assert.rejects(provider.next({ ...req(), egress: business }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 0);
  await provider.next(req()); await assert.rejects(provider.next({ ...req(), egress: business }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 1);
  const m1 = createResponsesModelProvider(h.config, h.transport);
  await assert.rejects(m1.generateStructuredOutput({ messages: createAgentIntentMessages("synthetic"), structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT, signal: options().signal, timeoutMs: 1000 }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 1);
});
