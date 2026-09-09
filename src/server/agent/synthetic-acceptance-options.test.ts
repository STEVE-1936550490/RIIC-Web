import assert from "node:assert/strict";
import test from "node:test";
import { parseSyntheticAcceptanceArgs, validateSyntheticAcceptanceOptions } from "./synthetic-acceptance-options.ts";
import { syntheticSmokeCommand } from "./synthetic-smoke-command.ts";

test("synthetic CLI defaults, explicit options, finite bounds and strict integer parsing", async () => {
  assert.deepEqual(parseSyntheticAcceptanceArgs([]), { mode: "basic", options: {} });
  assert.deepEqual(parseSyntheticAcceptanceArgs(["--mode", "full", "--chat-legacy-compat", "--agent-strict-ms", "30000", "--agent-total-ms", "60000", "--agent-tool-ms", "12000"]), { mode: "full", options: { chatLegacyCompat: true, strictMs: 30000, totalMs: 60000, toolMs: 12000 } });
  for (const flag of ["--agent-strict-ms", "--agent-total-ms", "--agent-tool-ms"]) for (const bad of ["0", "-1", "1.5", "1ms", "Infinity", "NaN", "60001", "", "1e3"]) assert.throws(() => parseSyntheticAcceptanceArgs([flag, bad]));
  for (const args of [["--mode", "full", "--mode", "basic"], ["--chat-legacy-compat", "--chat-legacy-compat"], ["--force-full"], ["--agent-tool-ms"], ["--mode", "auto"]]) assert.throws(() => parseSyntheticAcceptanceArgs(args));
  for (const value of [NaN, Infinity, 0, -1, 1.5, 60001]) assert.throws(() => validateSyntheticAcceptanceOptions({ totalMs: value }));
  const env = { AGENT_MODEL_PROTOCOL: "chat_completions", AGENT_MODEL_BASE_URL: "https://gateway.example.invalid/v1", AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic", RUN_COMPATIBLE_AGENT_SMOKE: "1" };
  const result = await syntheticSmokeCommand(env, "RUN_COMPATIBLE_AGENT_SMOKE", undefined, ["--agent-total-ms", "60001"]);
  assert.equal(result.requests, 0); assert.equal(result.status, "FAIL");
});
