import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readResponsesConfig } from "./responses-config.ts";
import { runSyntheticResponsesSmoke } from "./responses-smoke.ts";
import { record } from "./run-contract.ts";
const env = { AGENT_MODEL_PROTOCOL: "responses", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/v1", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic-model" };
function fakeHttp(badFacts = false): typeof fetch {
  return async (_url, init) => {
    const body = record(JSON.parse(String(init?.body)));
    let output: unknown[];
    const msg = (text: string) => ({ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
    const call = (id: string, name: string, args: unknown) => ({ type: "function_call", id: `item-${id}`, call_id: id, name, arguments: JSON.stringify(args) });
    if (typeof body.input === "string") output = [msg("SYNTHETIC_RESPONSES_OK")];
    else if (body.text) output = [msg(JSON.stringify({ intent: "get_room_detail", roomRef: "贸易站 1", leftPlanRef: null, rightPlanRef: null, missingFields: [], canProceed: true }))];
    else {
      assert.ok(Array.isArray(body.input));
      const inputs = body.input.map(record); const question = String(inputs[1].content);
      const observations = inputs.filter((i) => i.type === "function_call_output");
      if (question.includes("trade_1")) {
        output = observations.length ? [msg(badFacts ? "unrelated nonempty answer" : "共有2班，trade_1计划干员为贸易甲。")] : [call("s", "current_plan__get_summary", {}), call("r", "current_plan__get_room_detail", { roomRef: "trade_1", shiftIndex: null })];
      } else if (!observations.length) output = [call("l", "saved_plan__list", { query: "合成方案" })];
      else if (observations.length === 1) {
        const listed = record(JSON.parse(String(observations[0].output))); assert.ok(Array.isArray(listed.plans));
        const a = listed.plans.map(record).find((p) => p.title === "合成方案 A"); const b = listed.plans.map(record).find((p) => p.title === "合成方案 B"); assert.ok(a && b);
        output = [call("c", "saved_plan__compare", { leftPlanId: a.id, rightPlanId: b.id })];
      } else output = [msg("自然24小时龙门币从100到150，增加50。")];
    }
    return new Response(JSON.stringify({ object: "response", id: "resp", status: "completed", output, model: "reported-synthetic" }), { headers: { "content-type": "application/json" } });
  };
}
test("synthetic acceptance runs real M2 tools and authorization through SDK HTTP, not fabricated observations", async () => {
  const summary = await runSyntheticResponsesSmoke(readResponsesConfig(env), fakeHttp());
  assert.equal(summary.status, "PASS", JSON.stringify(summary)); assert.equal(summary.requests, 7);
  assert.equal(summary.functionToolLoop, "PASS"); assert.equal(summary.usage, "unavailable");
  assert.deepEqual(summary.capabilities.current.tools?.map((t) => t.name), ["current_plan.get_summary", "current_plan.get_room_detail"]);
  assert.deepEqual(summary.capabilities.saved.tools?.map((t) => t.name), ["saved_plan.list", "saved_plan.compare"]);
  const encoded = JSON.stringify(summary);
  for (const forbidden of ["synthetic-key", "gateway.example.invalid", "authorization", "encrypted_content", "currentPlan", "publicResult"]) assert.ok(!encoded.includes(forbidden));
});
test("nonempty answer without required facts is not acceptance PASS", async () => {
  const result = await runSyntheticResponsesSmoke(readResponsesConfig(env), fakeHttp(true));
  assert.equal(result.status, "FAIL"); assert.equal(result.capabilities.current.status, "FAIL");
});
test("CLI defaults offline and legacy opt-in cannot trigger official endpoint", () => {
  for (const [script, environment, expected] of [
    ["responses-agent-smoke.mts", {}, "NOT_RUN_MISSING_CONFIG"],
    ["responses-agent-smoke.mts", env, "NOT_RUN_NOT_OPTED_IN"],
    ["openai-agent-smoke.mts", { RUN_OPENAI_AGENT_SMOKE: "1", OPENAI_API_KEY: "synthetic-legacy", AGENT_OPENAI_MODEL: "legacy" }, "MIGRATED"],
  ] as const) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", `scripts/${script}`], { env: { NODE_ENV: "test", PATH: process.env.PATH, ...environment }, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).status, expected);
  }
});
