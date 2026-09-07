import { defineConfig, devices } from "@playwright/test";
// All browser traffic in this suite is loopback or intercepted synthetic fixtures.
// Do not send readiness probes through a developer's outbound HTTP proxy.
process.env.NO_PROXY = "127.0.0.1,localhost";
process.env.no_proxy = "127.0.0.1,localhost";
export default defineConfig({
  testDir: "./e2e", testMatch: "agent-poc.spec.ts", workers: 1, timeout: 90000,
  outputDir: ".tmp/agent-e2e", reporter: "list", use: { trace: "off", screenshot: "off" },
  projects: [
    { name: "agent-enabled", grep: /panel interaction/, use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5188" } },
    { name: "agent-disabled", grep: /production flag disabled/, use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5189" } },
  ],
  webServer: [true, false].map((enabled) => ({
    // Exercise the webpack production artifact; avoids dev watcher/worker restrictions.
    command: "node .next/standalone/server.js",
    url: `http://127.0.0.1:${enabled ? 5188 : 5189}/api/agent`, reuseExistingServer: false, timeout: 60000, stdout: "pipe",
    env: { AGENT_FEATURE_ENABLED: enabled ? "1" : "0", AGENT_MODEL_MODE: "fake", APP_DEPLOYMENT_ENV: enabled ? "development" : "production",
      PORT: enabled ? "5188" : "5189", HOSTNAME: "127.0.0.1", BETA_RATE_LIMIT_ENABLED: "0", ACCOUNT_CLOUD_SYNC_ENABLED: "1" },
  })),
});
