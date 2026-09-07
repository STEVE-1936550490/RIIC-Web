import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { createServer } from "node:net";
import { agentTestEnvironment } from "./agent-test-environment.ts";

const root = process.cwd();
const [mode, ...args] = process.argv.slice(2);
const commands = {
  check: ["npm", ["run", "check"]],
  test: ["npm", ["run", "test:agent"]],
  golden: ["npm", ["run", "test:agent:golden"]],
  typecheck: [process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]],
  build: ["npm", ["run", "build", "--", "--webpack"]],
  e2e: [process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.agent.config.ts", ...args]],
  demo: [process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.agent.config.ts", "--project=agent-enabled", "--grep", "three M0", "--headed"]],
};
if (!Object.hasOwn(commands, mode)) throw new Error("Unknown offline task.");
if (["build", "e2e", "demo"].includes(mode) && !existsSync(path.join(root, ".tmp/source-manifest.json"))) throw new Error("Use create-agent-test-copy.mjs first; build/browser work requires an isolated current-source copy.");
mkdirSync(path.join(root, ".tmp/agent-home"), { recursive: true });
const env = agentTestEnvironment(root);
if (mode === "build") env.NODE_ENV = "production";
if (mode === "demo") {
  env.AGENT_DEMO_PAUSE = "1"; env.PWDEBUG = "1";
  // A display address is needed for the optional headed demo, never model/session credentials.
  if (process.env.DISPLAY) env.DISPLAY = process.env.DISPLAY;
}
if (mode === "e2e" || mode === "demo") {
  const listeners = [createServer(), createServer()];
  try {
    for (const server of listeners) await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    env.RIIC_AGENT_ENABLED_PORT = String(listeners[0].address().port);
    env.RIIC_AGENT_DISABLED_PORT = String(listeners[1].address().port);
  } finally { for (const server of listeners) await new Promise((resolve) => server.close(resolve)); }
}
const [command, commandArgs] = commands[mode];
const child = spawn(command, commandArgs, { cwd: root, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Offline test process could not start."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
