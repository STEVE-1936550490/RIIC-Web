import { syntheticSmokeCommand } from "../src/server/agent/synthetic-smoke-command.ts";
const summary = await syntheticSmokeCommand(process.env, "RUN_CHAT_COMPLETIONS_AGENT_SMOKE", "chat_completions", process.argv.slice(2));
console.log(JSON.stringify(summary));
if (summary.status !== "PASS" && !summary.status.startsWith("NOT_RUN_")) process.exitCode = 1;
