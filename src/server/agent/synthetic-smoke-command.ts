import { missingModelConfig, readModelConfig, type ModelConfig, type ModelEnvironment } from "./compatible-config.ts";
import { AgentRunError } from "./run-contract.ts";
import { diagnosticForError } from "./compatible-transport.ts";

/** Only explicit command entry points opt in. No environment/credential file loading. */
export async function syntheticSmokeCommand(env: ModelEnvironment, optIn: string, protocol?: ModelConfig["protocol"], args: readonly string[] = []) {
  const missing = missingModelConfig(env);
  if (missing.length) return { status: "NOT_RUN_MISSING_CONFIG", missing, requests: 0 };
  if (env[optIn] !== "1") return { status: "NOT_RUN_NOT_OPTED_IN", requests: 0 };
  let stage = "configuration";
  try {
    if (args.length !== 0 && (args.length !== 2 || args[0] !== "--mode" || !["basic", "full"].includes(args[1]))) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
    const mode = (args[1] ?? "basic") as "basic" | "full";
    const config = readModelConfig(env);
    if (protocol && config.protocol !== protocol) throw new AgentRunError("AGENT_MODEL_PROTOCOL_UNSUPPORTED");
    stage = "runner";
    const { runSyntheticCompatibleSmoke } = await import("./compatible-smoke.ts");
    return await runSyntheticCompatibleSmoke(config, fetch, mode);
  } catch (error) {
    const safe = error instanceof AgentRunError ? error : new AgentRunError("AGENT_MODEL_SMOKE_FAILED");
    return { status: "FAIL", stage, requests: stage === "configuration" ? 0 : "unavailable", code: safe.code, diagnostic: diagnosticForError(safe) };
  }
}
