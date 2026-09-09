import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readModelConfig } from "./compatible-config.ts";
import { runSyntheticCompatibleSmoke } from "./compatible-smoke.ts";
import { record } from "./run-contract.ts";
const env = { AGENT_MODEL_PROTOCOL: "chat_completions", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/v1", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic-model" };
function runSmokeScript(args: string[], env: Record<string, string | undefined>, timeout = 5000) {
  const dir = mkdtempSync(join(tmpdir(), "riic-agent-smoke-"));
  const outPath = join(dir, "stdout.json");
  const errPath = join(dir, "stderr.log");
  const outFd = openSync(outPath, "w+");
  const errFd = openSync(errPath, "w+");
  try {
    const result = spawnSync(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", outFd, errFd], encoding: "utf8", timeout });
    return { result, stdout: readFileSync(outPath, "utf8"), stderr: readFileSync(errPath, "utf8") };
  } finally {
    closeSync(outFd); closeSync(errFd); rmSync(dir, { force: true, recursive: true });
  }
}

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

test("legacy is explicit per synthetic invocation, never inferred from model", async () => {
  const normal = fakeChat();
  const withReasoning: typeof fetch = async (...args) => {
    const response = await normal(...args); const body = await response.json();
    body.choices[0].message.reasoning_content = "private-side-channel";
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  const legacy = await runSyntheticCompatibleSmoke(readModelConfig(env), withReasoning, "full", { chatLegacyCompat: true, strictMs: 30000, totalMs: 60000, toolMs: 12000 });
  assert.equal(legacy.status, "PASS"); assert.equal(legacy.requests, 8); assert.equal(legacy.compatibilityMode, "explicit_chat_legacy");
  assert.ok(!JSON.stringify(legacy).includes("private-side-channel"));
  const strict = await runSyntheticCompatibleSmoke(readModelConfig(env), withReasoning, "basic");
  assert.equal(strict.requests, 1); assert.equal(strict.capabilities.basicCompletion.code, "AGENT_CHAT_CONTINUATION_UNSUPPORTED");
  assert.equal(strict.compatibilityMode, "default_strict");
  let requests = 0;
  await assert.rejects(runSyntheticCompatibleSmoke(readModelConfig({ ...env, AGENT_MODEL_PROTOCOL: "responses" }), async () => { requests++; throw new Error(); }, "basic", { chatLegacyCompat: true }));
  assert.equal(requests, 0);
  for (const model of ["zhipu/glm-5.3", "unrelated-model"]) {
    const result = await runSyntheticCompatibleSmoke(readModelConfig({ ...env, AGENT_MODEL_ID: model }), withReasoning, "basic");
    assert.equal(result.compatibilityMode, "default_strict"); assert.equal(result.acceptanceDeadlines.totalMs, 20000); assert.equal(result.requests, 1);
  }
});

test("fact failures classify current answer, room, shift and saved output without echoing payloads", async () => {
  const normal = fakeChat();
  for (const [kind, expected] of [["answer", "CURRENT_ANSWER"], ["room", "CURRENT_ROOM_REF"], ["shift", "CURRENT_ACTIVE_SHIFT_ARGUMENT"], ["saved", "SAVED_ANSWER"]]) {
    const result = await runSyntheticCompatibleSmoke(readModelConfig(env), async (...args) => {
      const response = await normal(...args); const body = await response.json(); const message = body.choices[0].message;
      if (kind === "answer" && message.content?.includes("贸易甲")) message.content = "private-wrong-answer";
      if (kind === "saved" && message.content?.includes("100到150")) message.content = "private-wrong-answer";
      const room = message.tool_calls?.find((c: { function: { name: string } }) => c.function.name === "current_plan__get_room_detail");
      if (room && kind === "room") room.function.arguments = JSON.stringify({ roomRef: "贸易站 1", shiftIndex: null });
      if (room && kind === "shift") room.function.arguments = JSON.stringify({ roomRef: "trade_1", shiftIndex: 0 });
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    assert.equal(result.capabilities[kind === "saved" ? "saved" : "current"].code, `AGENT_MODEL_SMOKE_FACT_MISMATCH_${expected}`);
    assert.ok(!JSON.stringify(result).includes("private-wrong-answer"));
  }
});

test("custom strict timeout stops full acceptance with no follow-up attempts", async () => {
  const normal = fakeChat(); let requests = 0; let aborted = false;
  const result = await runSyntheticCompatibleSmoke(readModelConfig(env), async (...args) => {
    requests++;
    if (requests !== 3) return normal(...args);
    return new Promise((_resolve, reject) => { args[1]?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("synthetic abort", "AbortError")); }, { once: true }); });
  }, "full", { strictMs: 10 });
  assert.equal(requests, 3); assert.equal(result.capabilities.strictStructuredOutput.code, "AGENT_MODEL_TIMEOUT");
  assert.equal(result.capabilities.current.status, "BLOCKED"); assert.equal(result.capabilities.saved.status, "BLOCKED");
  assert.equal(aborted, true);
});


test("old process opt-ins and acceptance settings cannot enable legacy or change default budgets", () => {
  // A fresh module graph catches regressions that read process.env at import time.
  const child = runSmokeScript(["--experimental-strip-types", "--input-type=module", "-e", `
    const { readModelConfig } = await import("./src/server/agent/compatible-config.ts");
    const { runSyntheticCompatibleSmoke } = await import("./src/server/agent/compatible-smoke.ts");
    const config = readModelConfig({ AGENT_MODEL_PROTOCOL: "chat_completions", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/v1", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic-model" });
    let requests = 0;
    const mockHTTP = async () => {
      requests++;
      return new Response(JSON.stringify({ object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "SYNTHETIC_CHAT_OK", reasoning_content: "private-synthetic-reasoning" } }] }), { headers: { "content-type": "application/json" } });
    };
    const strict = await runSyntheticCompatibleSmoke(config, mockHTTP, "basic");
    const legacy = await runSyntheticCompatibleSmoke(config, mockHTTP, "basic", { chatLegacyCompat: true });
    console.log(JSON.stringify({ strict, legacy, requests }));
  `], { PATH: process.env.PATH, NODE_ENV: "test", ACCEPTANCE_CHAT_LEGACY_COMPAT: "1", ACCEPTANCE_AGENT_TOTAL_MS: "60000", ACCEPTANCE_AGENT_TOOL_MS: "12000", ACCEPTANCE_AGENT_STRICT_MS: "30000", RUN_OPENAI_AGENT_SMOKE: "1", RUN_RESPONSES_AGENT_SMOKE: "1" }, 10000);
  assert.equal(child.result.status, 0, child.stderr);
  const { strict, legacy, requests } = JSON.parse(child.stdout);
  assert.equal(requests, 2); assert.equal(strict.requests, 1); assert.equal(legacy.requests, 1);
  assert.equal(strict.capabilities.basicCompletion.code, "AGENT_CHAT_CONTINUATION_UNSUPPORTED");
  assert.equal(strict.compatibilityMode, "default_strict");
  assert.deepEqual(strict.acceptanceDeadlines, { strictMs: 15000, totalMs: 20000, toolMs: 5000 });
  assert.equal(legacy.status, "PASS"); assert.equal(legacy.compatibilityMode, "explicit_chat_legacy");
  assert.ok(!child.stdout.includes("private-synthetic-reasoning"));
});
