import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readModelConfig } from "./compatible-config.ts";
import { createCompatibleLoopProvider, createCompatibleModelProvider } from "./compatible-provider.ts";
import { createChatCompletionsTransport, type ChatCompletionsConfig } from "./chat-completions-transport.ts";
import { createChatCompletionsLoopProvider } from "./chat-completions-provider.ts";
import { CompatibleProviderError } from "./compatible-transport.ts";
import { syntheticEgress, syntheticExecution } from "./m3-test-support.ts";
import { AGENT_INTENT_DECISION_OUTPUT_CONTRACT } from "./intent-contract.ts";
import { parseLoopDecision, type LoopRequest } from "./loop-provider.ts";
import { record } from "./run-contract.ts";
const { visibleTools } = await import("./tool-registry.ts");
const env = { AGENT_MODEL_PROTOCOL: "chat_completions", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/custom/v1/", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "vendor/synthetic-model" };
const config = () => readModelConfig(env) as ChatCompletionsConfig;
const options = () => ({ signal: new AbortController().signal, timeout: 1000, maxRetries: 0 as const });
const req = (): LoopRequest => ({ runId: "run-a", message: "synthetic", tools: visibleTools(syntheticExecution()), observations: [], signal: options().signal, egress: syntheticEgress });
const call = (id = "call-1", name = "current_plan__get_summary", args = "{}") => ({ id, type: "function", function: { name, arguments: args } });
const envelope = (message: unknown = { role: "assistant", content: "synthetic answer" }, reason = "stop", extra = {}) => ({ object: "chat.completion", id: "completion-1", model: "reported-synthetic", choices: [{ index: 0, message, finish_reason: reason }], ...extra });
const called = (...calls: unknown[]) => envelope({ role: "assistant", content: null, tool_calls: calls }, "tool_calls");
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function harness(outputs: unknown[]) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers; redirect?: string }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: record(JSON.parse(String(init?.body))), headers: new Headers(init?.headers), redirect: init?.redirect });
    return json(outputs.shift());
  };
  return { requests, fetcher, provider: createCompatibleLoopProvider(config(), fetcher) };
}
test("explicit protocol configuration, both complete route rejections and forged configs", () => {
  for (const protocol of ["responses", "chat_completions"]) {
    for (const path of ["responses", "responses/", "chat/completions", "CHAT/COMPLETIONS/", "%72esponses", "../v1", "a//b"]) {
      assert.throws(() => readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol, AGENT_MODEL_BASE_URL: `https://gateway.example.invalid/${path}` }), { code: "AGENT_MODEL_URL_INVALID" });
    }
    for (const url of ["https://u:p@example.invalid", "https://example.invalid?key=secret", "https://example.invalid#x", "http://example.invalid", "https://api.openai.com/v1"]) assert.throws(() => readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol, AGENT_MODEL_BASE_URL: url }));
    assert.equal(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol }).protocol, protocol);
  }
  for (const protocol of ["", "auto", "moma", "chat", "RESPONSES"]) assert.throws(() => readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol }));
  assert.throws(() => readModelConfig({ ...env, AGENT_MODEL_REASONING_CONTINUATION: "encrypted" }));
  assert.throws(() => createCompatibleLoopProvider({ ...config() }));
  assert.throws(() => createChatCompletionsTransport(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: "responses" }) as ChatCompletionsConfig));
});
test("SDK Chat tool mapping, multiple calls, matching IDs and ordered multi-round refill", async () => {
  const h = harness([called(call(), call("call-2", "current_plan__get_room_detail", '{"roomRef":"trade_1","shiftIndex":null}')), called(call("call-3", "saved_plan__list", '{"query":null}')), envelope()]);
  const request = req();
  const first = parseLoopDecision((await h.provider.next(request)).decision);
  assert.equal(first.type, "calls"); if (first.type !== "calls") throw new Error();
  assert.deepEqual(first.calls.map((c) => c.name), ["current_plan.get_summary", "current_plan.get_room_detail"]);
  const observations = first.calls.map((call) => ({ call, result: { status: "ok", synthetic: true } }));
  const second = parseLoopDecision((await h.provider.next({ ...request, observations })).decision);
  if (second.type !== "calls") throw new Error();
  const final = await h.provider.next({ ...request, observations: [...observations, { call: second.calls[0], result: { status: "empty" } }] });
  assert.deepEqual(final.decision, { type: "final", answer: "synthetic answer" });
  assert.equal(final.usage, undefined);
  for (const sent of h.requests) {
    assert.equal(sent.url, "https://gateway.example.invalid/custom/v1/chat/completions");
    assert.equal(sent.redirect, "manual"); assert.equal(sent.body.store, false); assert.equal(sent.body.stream, false);
    assert.equal(sent.body.model, env.AGENT_MODEL_ID); assert.equal(sent.body.max_completion_tokens, 1800);
    assert.equal(sent.body.tool_choice, "auto"); assert.equal(sent.body.input, undefined);
    assert.ok(Array.isArray(sent.body.tools));
    assert.ok(sent.body.tools.every((t) => record(record(t).function).strict === true));
  }
  const messages = (h.requests[2].body.messages as unknown[]).map(record);
  assert.deepEqual(messages.map((m) => m.role), ["system", "user", "assistant", "tool", "tool", "assistant", "tool"]);
  assert.deepEqual(messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id), ["call-1", "call-2", "call-3"]);
  await assert.rejects(h.provider.next(request), { code: "AGENT_CHAT_RUN_REUSE" });
});
test("missing, altered and duplicate refill, unknown tool, repeated IDs and cross-run history reject", async () => {
  for (const output of [called(call("a", "unknown")), called(call(), call()), called(call("a", "current_plan__get_summary", "{")), called(call("a", "current_plan__get_summary", "[]"))]) {
    const h = harness([output]); await assert.rejects(h.provider.next(req())); assert.equal(h.requests.length, 1);
  }
  for (const mode of ["missing", "wrong_id", "wrong_args", "duplicate", "other_run", "repeat_id"]) {
    const h = harness([called(call()), called(call())]); const request = req();
    const decision = parseLoopDecision((await h.provider.next(request)).decision); if (decision.type !== "calls") throw new Error();
    const observation = { call: decision.calls[0], result: { status: "ok" } };
    const observations = mode === "missing" ? [] : mode === "duplicate" ? [observation, observation] : [{ ...observation, call: { ...observation.call, ...(mode === "wrong_id" ? { id: "wrong" } : {}), ...(mode === "wrong_args" ? { arguments: { fake: true } } : {}) } }];
    await assert.rejects(h.provider.next({ ...request, runId: mode === "other_run" ? "run-b" : request.runId, observations }));
    assert.equal(h.requests.length, mode === "repeat_id" ? 2 : 1);
  }
});
test("Chat strict M1 contract and usage mapping preserve local parser semantics", async () => {
  const decision = { intent: "get_room_detail", roomRef: "贸易站 1", leftPlanRef: null, rightPlanRef: null, missingFields: [], canProceed: true };
  const h = harness([envelope({ role: "assistant", content: JSON.stringify(decision) }, "stop", { usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 } })]);
  const result = await createCompatibleModelProvider(config(), h.fetcher).generateStructuredOutput({ egress: syntheticEgress, messages: [{ role: "user", content: "synthetic" }], structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT, signal: options().signal, timeoutMs: 1000 });
  assert.deepEqual(result.output, decision); assert.deepEqual(result.metadata.usage, { inputTokens: 5, outputTokens: 8, totalTokens: 13 });
  assert.deepEqual(h.requests[0].body.response_format, { type: "json_schema", json_schema: { name: AGENT_INTENT_DECISION_OUTPUT_CONTRACT.name, schema: AGENT_INTENT_DECISION_OUTPUT_CONTRACT.schema, strict: true } });
});
test("malformed/incomplete/refusal/unsupported continuation never yields final success", async () => {
  for (const body of [null, {}, { choices: [] }, envelope({}, "stop"), envelope({ role: "assistant", content: "partial" }, "length"), envelope({ role: "assistant", refusal: "private", content: null }),
    envelope({ role: "assistant", content: "x" }, "content_filter"), envelope({ role: "assistant", content: "x", reasoning_content: "private reasoning" }),
    envelope({ role: "assistant", content: "x", tool_calls: [call()] }), called({ ...call(), id: "" }), envelope({ role: "assistant", content: "x" }, "stop", { usage: { prompt_tokens: -1 } }),
    { ...envelope(), choices: [envelope().choices[0], envelope().choices[0]] }]) {
    const h = harness([body]); await assert.rejects(h.provider.next(req())); assert.equal(h.requests.length, 1);
  }
});
test("both protocols retain safe HTTP diagnostics and never fallback or echo upstream secrets", async () => {
  for (const protocol of ["responses", "chat_completions"]) for (const [status, upstreamCode, category] of [
    [400, "unsupported_parameter", "capability_incompatibility"], [404, "model_not_found", "configuration_error"], [404, "private-secret", "route_incompatibility"],
    [405, "private-secret", "route_incompatibility"], [401, "invalid_api_key", "authentication_error"], [403, "private-secret", "authentication_error"],
    [422, "unsupported_value", "capability_incompatibility"], [429, "rate_limit_exceeded", "provider_error"], [503, "private-secret", "provider_error"],
  ] as const) {
    const urls: string[] = [];
    const provider = createCompatibleLoopProvider(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol }), async (url) => { urls.push(String(url)); return json({ error: { code: upstreamCode, message: "private-secret Bearer synthetic-key", param: "private-secret" } }, status); });
    await assert.rejects(provider.next(req()), (error: unknown) => {
      assert.ok(error instanceof CompatibleProviderError); assert.equal(error.diagnostic.httpStatus, status); assert.equal(error.diagnostic.category, category);
      assert.equal(error.diagnostic.rootCause, "UNRESOLVED"); assert.equal(error.cause, undefined);
      for (const secret of ["private-secret", "synthetic-key", "gateway.example.invalid"]) assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    });
    assert.deepEqual(urls, [`https://gateway.example.invalid/custom/v1/${protocol === "responses" ? "responses" : "chat/completions"}`]);
  }
});
test("Chat rejects redirects/HTML/malformed JSON, preserves request cap and no retries", async () => {
  for (const response of [() => new Response("private", { status: 302, headers: { location: "https://other.example.invalid" } }), () => new Response("<html>private</html>"), () => new Response("{", { headers: { "content-type": "application/json" } })]) {
    let count = 0; const provider = createCompatibleLoopProvider(config(), async () => { count++; return response(); });
    await assert.rejects(provider.next(req()), (error: unknown) => {
      if (error instanceof CompatibleProviderError) { assert.ok([200, 302].includes(error.diagnostic.httpStatus!)); assert.equal(error.diagnostic.upstreamCode, "UNKNOWN"); }
      return true;
    }); assert.equal(count, 1);
  }
  const budget = { requests: 12, maximum: 12 };
  const transport = createChatCompletionsTransport(config(), async () => { throw new Error("must not fetch"); }, budget);
  await assert.rejects(transport.create({ model: "ignored", messages: [] }, options()), { code: "AGENT_CHAT_REQUEST_BUDGET" });
});
test("Chat SDK timeout/abort and independent initial/subsequent egress blocking", async () => {
  let count = 0;
  const transport = createChatCompletionsTransport(config(), async (_url, init) => { count++; return new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); }); });
  await assert.rejects(transport.create({ model: "ignored", messages: [] }, { ...options(), timeout: 15 }), { code: "AGENT_MODEL_TIMEOUT" }); assert.equal(count, 1);
  const controller = new AbortController(); const pending = transport.create({ model: "ignored", messages: [] }, { ...options(), signal: controller.signal });
  setTimeout(() => controller.abort(), 10); await assert.rejects(pending, { code: "AGENT_ABORTED" }); assert.equal(count, 2);
  const h = harness([called(call())]); const business = { classification: "user_business_context" as const, localTestApproved: true };
  await assert.rejects(h.provider.next({ ...req(), egress: business }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 0);
  await h.provider.next(req()); await assert.rejects(h.provider.next({ ...req(), egress: business }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 1);
  await assert.rejects(createCompatibleModelProvider(config(), h.fetcher).generateStructuredOutput({ messages: [], structuredOutput: AGENT_INTENT_DECISION_OUTPUT_CONTRACT, signal: options().signal, timeoutMs: 1000 }), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(h.requests.length, 1);
});
test("Chat run instance cannot be used concurrently", async () => {
  let resolve!: () => void;
  const ready = new Promise<void>((r) => { resolve = r; });
  const transport = createChatCompletionsTransport(config(), async () => { await ready; return json(envelope()); });
  const provider = createChatCompletionsLoopProvider(config(), transport); const pending = provider.next(req());
  await assert.rejects(provider.next(req()), { code: "AGENT_CHAT_RUN_REUSE" }); resolve(); await pending;
});
test("new commands stay offline without their own explicit opt-in, reject protocol mismatch", () => {
  for (const script of ["compatible-agent-smoke.mts", "chat-completions-agent-smoke.mts"]) for (const configuration of [{}, env]) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", `scripts/${script}`], { env: { PATH: process.env.PATH, NODE_ENV: "test", ...configuration, RUN_RESPONSES_AGENT_SMOKE: "1", RUN_OPENAI_AGENT_SMOKE: "1" }, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0); const summary = JSON.parse(result.stdout); assert.match(summary.status, /^NOT_RUN_/); assert.equal(summary.requests, 0);
  }
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/chat-completions-agent-smoke.mts"], { env: { PATH: process.env.PATH, NODE_ENV: "test", ...env, AGENT_MODEL_PROTOCOL: "responses", RUN_CHAT_COMPLETIONS_AGENT_SMOKE: "1" }, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).code, "AGENT_MODEL_PROTOCOL_UNSUPPORTED");
});

test("both adapters bind initial message/tools, reject alias collisions and work with unrelated configured endpoints/models", async () => {
  for (const protocol of ["responses", "chat_completions"] as const) {
    for (const [baseURL, model] of [["https://alpha.example.invalid/custom", "supplier-a/model-one"], ["https://beta.example.invalid/v9", "unrelated-model-two"]]) {
      let sent = 0;
      const cfg = readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol, AGENT_MODEL_BASE_URL: baseURL, AGENT_MODEL_ID: model });
      const provider = createCompatibleLoopProvider(cfg, async (url, init) => {
        sent++; assert.equal(String(url), `${baseURL}/${protocol === "responses" ? "responses" : "chat/completions"}`);
        assert.equal(record(JSON.parse(String(init?.body))).model, model);
        return json(protocol === "responses" ? { status: "completed", output: [{ type: "function_call", call_id: "call-1", name: "current_plan__get_summary", arguments: "{}" }] } : called(call()));
      });
      const request = req(); const result = parseLoopDecision((await provider.next(request)).decision); if (result.type !== "calls") throw new Error();
      await assert.rejects(provider.next({ ...request, message: "changed", observations: [{ call: result.calls[0], result: { status: "ok" } }] })); assert.equal(sent, 1);
      const collision = createCompatibleLoopProvider(cfg, async () => { throw new Error("must not fetch"); });
      const base = request.tools[0];
      await assert.rejects(collision.next({ ...request, tools: [{ ...base, name: "a.b" }, { ...base, name: "a__b" }] }));
    }
  }
});
