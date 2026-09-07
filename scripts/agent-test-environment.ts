import path from "node:path";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

/** Explicit test environment; never inherit provider settings, opt-ins, proxies or credentials. */
export function agentTestEnvironment(root: string) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: path.join(root, ".tmp/agent-home"),
    TMPDIR: tmpdir(), LANG: "C.UTF-8", TZ: "Asia/Shanghai",
    NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1", CI: "1",
    NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost",
    ACCOUNT_CLOUD_SYNC_ENABLED: "1", BETA_RATE_LIMIT_ENABLED: "0",
    BETA_STORAGE_DIR: mkdtempSync(path.join(tmpdir(), "riic-agent-storage-")),
    PLAYWRIGHT_BROWSERS_PATH: path.join(homedir(), ".cache/ms-playwright"),
  };
}
