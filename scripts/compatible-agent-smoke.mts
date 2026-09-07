import { syntheticSmokeCommand } from "../src/server/agent/synthetic-smoke-command.ts";
const summary = await syntheticSmokeCommand(process.env, "RUN_COMPATIBLE_AGENT_SMOKE", undefined, process.argv.slice(2));
console.log(JSON.stringify(summary));
if (summary.status !== "PASS" && !summary.status.startsWith("NOT_RUN_")) process.exitCode = 1;
