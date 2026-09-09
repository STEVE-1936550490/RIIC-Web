import { AgentRunError } from "./run-contract.ts";

export type SyntheticAcceptanceOptions = { chatLegacyCompat?: boolean; strictMs?: number; totalMs?: number; toolMs?: number };
export const SYNTHETIC_DEADLINE_MAX = Object.freeze({ strictMs: 30000, totalMs: 60000, toolMs: 12000 });
export function validateSyntheticAcceptanceOptions(options: SyntheticAcceptanceOptions): void {
  if (Object.keys(options).some((key) => !["chatLegacyCompat", "strictMs", "totalMs", "toolMs"].includes(key)) ||
      (options.chatLegacyCompat !== undefined && typeof options.chatLegacyCompat !== "boolean")) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
  for (const key of ["strictMs", "totalMs", "toolMs"] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > SYNTHETIC_DEADLINE_MAX[key])) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
  }
}
export function parseSyntheticAcceptanceArgs(args: readonly string[]) {
  let mode: "basic" | "full" = "basic";
  const options: SyntheticAcceptanceOptions = {};
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
    seen.add(flag);
    if (flag === "--chat-legacy-compat") { options.chatLegacyCompat = true; continue; }
    const value = args[++i];
    if (flag === "--mode" && (value === "basic" || value === "full")) { mode = value; continue; }
    const key = flag === "--agent-strict-ms" ? "strictMs" : flag === "--agent-total-ms" ? "totalMs" : flag === "--agent-tool-ms" ? "toolMs" : undefined;
    if (!key || !/^[1-9][0-9]*$/.test(value ?? "")) throw new AgentRunError("AGENT_MODEL_CONFIG_INVALID");
    options[key] = Number(value);
  }
  validateSyntheticAcceptanceOptions(options);
  return { mode, options };
}
