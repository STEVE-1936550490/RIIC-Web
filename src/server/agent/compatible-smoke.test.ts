import assert from "node:assert/strict";
import test from "node:test";
import { readModelConfig } from "./compatible-config.ts";
import { runSyntheticCompatibleSmoke } from "./compatible-smoke.ts";
import { record } from "./run-contract.ts";
const env = { AGENT_MODEL_PROTOCOL: "chat_completions", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/v1", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic-model" };
function fakeChat(mode: "pass" | "bad_facts" | "bad_args" | "bad_id" | "no_tools" | "no_strict" | "no_json" = "pass"): typeof fetch {
  return async (url, init) => {
    assert.equal(String(url), "https://gateway.example.invalid/v1/chat/completions");
    const body = record(JSON.parse(String(init?.body)));
    assert.equal(body.store, false); assert.equal(body.stream, false);
    assert.ok(Array.isArray(body.messages)); const messages = body.messages.map(record);
    let message: unknown; let reason = "stop";
    const msg = (content: string) => ({ role: "assistant", content });
    const call = (id: string, name: string, args: unknown) => ({ type: "function", id: mode === "bad_id" ? "" : id, function: { name, arguments: JSON.stringify(args) } });
    const calls = (...tool_calls: unknown[]) => { reason = "tool_calls"; return { role: "assistant", content: null, tool_calls }; };
    const format = body.response_format && record(body.response_format).type;
    if ((format === "json_schema" && mode === "no_strict") || (format === "json_object" && mode === "no_json")) return new Response(JSON.stringify({ error: { code: "unsupported_response_format", message: "private-upstream-message" } }), { status: 400, headers: { "content-type": "application/json" } });
    if (format === "json_object") message = msg('{"synthetic":true}');
    else if (format === "json_schema") message = msg(JSON.stringify({ intent: "get_room_detail", roomRef: "贸易站 1", leftPlanRef: null, rightPlanRef: null, missingFields: [], canProceed: true }));
    else if (messages.length === 1) message = msg("SYNTHETIC_CHAT_OK");
    else if (mode === "no_tools") message = msg("a nonempty answer");
    else {
      const observations = messages.filter((m) => m.role === "tool");
      const question = String(messages[1].content);
      if (question.includes("trade_1")) message = observations.length ? msg(mode === "bad_facts" ? "a nonempty answer" : "共有2班，计划干员贸易甲。") : calls(call("s", "current_plan__get_summary", mode === "bad_args" ? { injected: true } : {}), call("r", "current_plan__get_room_detail", { roomRef: "trade_1", shiftIndex: null }));
      else if (!observations.length) message = calls(call("l", "saved_plan__list", { query: "合成方案" }));
      else if (observations.length === 1) {
        assert.equal(observations[0].tool_call_id, "l");
        const list = record(JSON.parse(String(observations[0].content))); assert.ok(Array.isArray(list.plans));
        const plans = list.plans.map(record); assert.ok(!plans.some((p) => p.id === "synthetic-foreign"));
        const a = plans.find((p) => p.title === "合成方案 A"); const b = plans.find((p) => p.title === "合成方案 B"); assert.ok(a && b);
        message = calls(call("c", "saved_plan__compare", { leftPlanId: a.id, rightPlanId: b.id }));
      } else { assert.equal(observations[1].tool_call_id, "c"); message = msg("自然24小时龙门币100到150，增加50。"); }
    }
    return new Response(JSON.stringify({ object: "chat.completion", model: "reported-synthetic", choices: [{ index: 0, finish_reason: reason, message }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }), { headers: { "content-type": "application/json" } });
  };
}
test("Chat acceptance executes real M2 summary/room/list/compare and checks ID refill, facts, sources and usage", async () => {
  const result = await runSyntheticCompatibleSmoke(readModelConfig(env), fakeChat());
  assert.equal(result.status, "PASS", JSON.stringify(result)); assert.equal(result.requests, 8); assert.equal(result.functionToolLoop, "PASS");
  assert.equal(result.protocol, "chat_completions"); assert.equal(result.requestShape, "m3.5b-strict-tools-v1");
  assert.deepEqual(result.capabilities.current.tools?.map((t) => t.name), ["current_plan.get_summary", "current_plan.get_room_detail"]);
  assert.deepEqual(result.capabilities.saved.tools?.map((t) => t.name), ["saved_plan.list", "saved_plan.compare"]);
  assert.ok(Array.isArray(result.usage) && result.usage.length === 8);
  for (const secret of ["synthetic-key", "gateway.example.invalid", "currentPlan", "publicResult", "private-upstream-message", "tool_call_id"]) assert.ok(!JSON.stringify(result).includes(secret));
});
test("basic failure blocks dependent probes with one attempt, safe diagnostics survive", async () => {
  for (const protocol of ["responses", "chat_completions"]) {
    const result = await runSyntheticCompatibleSmoke(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol }), async () => new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "private-upstream-message" } }), { status: 401, headers: { "content-type": "application/json" } }));
    assert.equal(result.requests, 1); assert.equal(result.capabilities.basicCompletion.status, "FAIL");
    assert.equal(result.capabilities.basicCompletion.diagnostic?.httpStatus, 401);
    for (const name of ["jsonOutput", "strictStructuredOutput", "current", "saved"]) assert.equal(result.capabilities[name].status, "BLOCKED");
    assert.equal(result.functionToolLoop, "BLOCKED"); assert.equal(result.usage, "unavailable");
    assert.ok(!JSON.stringify(result).includes("private-upstream-message"));
  }
});
test("JSON and strict output capabilities are independent of each other and the tool loop", async () => {
  for (const mode of ["no_json", "no_strict"] as const) {
    const result = await runSyntheticCompatibleSmoke(readModelConfig(env), fakeChat(mode));
    assert.equal(result.status, "CAPABILITY_INCOMPATIBLE"); assert.equal(result.functionToolLoop, "PASS");
    const failed = result.capabilities[mode === "no_json" ? "jsonOutput" : "strictStructuredOutput"];
    assert.equal(failed.status, "FAIL"); assert.equal(failed.diagnostic?.httpStatus, 400);
    assert.equal(result.capabilities[mode === "no_json" ? "strictStructuredOutput" : "jsonOutput"].status, "PASS");
  }
});
test("completion/JSON alone, wrong facts/arguments/call IDs cannot pass Agent acceptance", async () => {
  for (const mode of ["bad_facts", "bad_args", "bad_id", "no_tools"] as const) {
    const result = await runSyntheticCompatibleSmoke(readModelConfig(env), fakeChat(mode));
    assert.equal(result.capabilities.basicCompletion.status, "PASS"); assert.equal(result.capabilities.strictStructuredOutput.status, "PASS");
    assert.equal(result.capabilities.current.status, "FAIL"); assert.notEqual(result.functionToolLoop, "PASS"); assert.notEqual(result.status, "PASS");
  }
});

test("basic mode performs at most one attempt for both protocols and blocks full capabilities", async () => {
  for (const protocol of ["responses", "chat_completions"]) {
    let requests = 0;
    const result = await runSyntheticCompatibleSmoke(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: protocol }), async () => {
      requests++;
      return new Response(JSON.stringify(protocol === "responses" ? { status: "completed", output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "SYNTHETIC_RESPONSES_OK" }] }] } : { object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "SYNTHETIC_CHAT_OK" } }] }), { headers: { "content-type": "application/json" } });
    }, "basic");
    assert.equal(result.status, "PASS"); assert.equal(result.mode, "basic"); assert.equal(result.requestLimit, 1);
    assert.equal(requests, 1); assert.equal(result.requests, 1); assert.equal(result.functionToolLoop, "BLOCKED");
    for (const key of ["strictStructuredOutput", "jsonOutput", "current", "saved"]) assert.equal(result.capabilities[key].status, "BLOCKED");
  }
});
test("authentication/rate limit/server failure in a later stage stops remaining requests with stage diagnostics", async () => {
  for (const stageAt of [2, 3, 5]) for (const status of [401, 403, 429, 503]) {
    let requests = 0; const normal = fakeChat();
    const result = await runSyntheticCompatibleSmoke(readModelConfig(env), async (...args) => {
      requests++;
      return requests === stageAt ? new Response(JSON.stringify({ error: { code: "malicious-key", type: "malicious-type", message: "private response payload" } }), { status, headers: { "content-type": "application/json" } }) : normal(...args);
    });
    assert.equal(requests, stageAt); assert.equal(result.requests, stageAt);
    const stage = stageAt === 2 ? "jsonOutput" : stageAt === 3 ? "strictStructuredOutput" : "current";
    assert.equal(result.capabilities[stage].diagnostic?.httpStatus, status);
    assert.equal(result.capabilities[stage].diagnostic?.upstreamCode, "UNKNOWN"); assert.equal(result.capabilities[stage].diagnostic?.upstreamType, "UNKNOWN");
    assert.equal(result.capabilities[stage].stage, stage); assert.equal(result.capabilities.saved.status, "BLOCKED");
    assert.equal(Object.values(result.capabilities).reduce((n, c) => n + (c.requests ?? 0), 0), requests);
    assert.ok(!JSON.stringify(result).includes("malicious")); assert.ok(!JSON.stringify(result).includes("private response payload"));
  }
});

test("full acceptance counts all attempts and cannot exceed the shared 12-request ceiling", async () => {
  const normal = fakeChat(); let requests = 0;
  const result = await runSyntheticCompatibleSmoke(readModelConfig(env), async (...args) => {
    requests++;
    if (requests <= 3) return normal(...args);
    return new Response(JSON.stringify({ object: "chat.completion", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: "checking", tool_calls: [{ id: `call-${requests}`, type: "function", function: { name: "saved_plan__list", arguments: JSON.stringify({ query: `synthetic-${requests}` }) } }] } }] }), { headers: { "content-type": "application/json" } });
  });
  assert.equal(requests, 12); assert.equal(result.requests, 12); assert.equal(result.status, "FAIL");
  assert.equal(result.capabilities.saved.code, "AGENT_CHAT_REQUEST_BUDGET"); assert.equal(result.capabilities.saved.diagnostic?.category, "budget");
});
