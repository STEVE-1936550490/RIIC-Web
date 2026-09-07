import { missingResponsesConfig, readResponsesConfig } from "../src/server/agent/responses-config.ts";
import { AgentRunError } from "../src/server/agent/run-contract.ts";

// No .env loading, custom input, page snapshots, real session, database or retries.
const missing = missingResponsesConfig();
if (missing.length) {
  console.log(JSON.stringify({ status: "NOT_RUN_MISSING_CONFIG", missing, requests: 0 }));
} else if (process.env.RUN_RESPONSES_AGENT_SMOKE !== "1") {
  console.log(JSON.stringify({ status: "NOT_RUN_NOT_OPTED_IN", requests: 0 }));
} else {
  try {
    const config = readResponsesConfig();
    const { runSyntheticResponsesSmoke } = await import("../src/server/agent/responses-smoke.ts");
    const summary = await runSyntheticResponsesSmoke(config);
    console.log(JSON.stringify(summary));
    if (summary.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ status: "FAIL", code: error instanceof AgentRunError ? error.code : "AGENT_RESPONSES_SMOKE_FAILED" }));
    process.exitCode = 1;
  }
}
