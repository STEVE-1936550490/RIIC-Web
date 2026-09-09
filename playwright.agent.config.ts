import { agentTestEnvironment } from "./scripts/agent-test-environment";
import { defineConfig, devices } from "@playwright/test";
// All browser traffic in this suite is loopback or intercepted synthetic fixtures.
// Do not send readiness probes through a developer's outbound HTTP proxy.
process.env.NO_PROXY = "127.0.0.1,localhost";
process.env.no_proxy = "127.0.0.1,localhost";
function port(value: string | undefined, fallback: number) {
  if (value !== undefined && (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535)) throw new Error("Invalid isolated test port.");
  return value ?? String(fallback);
}
const enabledPort = port(process.env.RIIC_AGENT_ENABLED_PORT, 5188);
const disabledPort = port(process.env.RIIC_AGENT_DISABLED_PORT, 5189);
export default defineConfig({
  testDir: "./e2e", testMatch: "agent-poc.spec.ts", workers: 1, timeout: 90000,
  outputDir: ".tmp/agent-e2e", reporter: "list", use: { trace: "off", screenshot: "off" },
  projects: [
    { name: "agent-enabled", grep: /panel interaction|three M0|late response|processing consent|planning preview/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${enabledPort}` } },
    { name: "agent-disabled", grep: /production flag disabled/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${disabledPort}` } },
  ],
  webServer: [true, false].map((enabled) => ({
    // Exercise the webpack production artifact; avoids dev watcher/worker restrictions.
    command: "node .next/standalone/server.js",
    url: `http://127.0.0.1:${enabled ? enabledPort : disabledPort}/api/agent`, reuseExistingServer: false, timeout: 60000, stdout: "pipe",
    env: { ...agentTestEnvironment(process.cwd()), NODE_ENV: "production", AGENT_FEATURE_ENABLED: enabled ? "1" : "0", AGENT_MODEL_MODE: "fake", APP_DEPLOYMENT_ENV: enabled ? "development" : "production",
      PORT: enabled ? enabledPort : disabledPort, HOSTNAME: "127.0.0.1", BETA_RATE_LIMIT_ENABLED: "0", ACCOUNT_CLOUD_SYNC_ENABLED: "1" },
  })),
});
