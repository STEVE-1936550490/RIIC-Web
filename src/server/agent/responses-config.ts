import { AgentRunError } from "./run-contract.ts";

export const RESPONSES_REQUIRED_ENV = ["AGENT_MODEL_PROTOCOL", "AGENT_MODEL_BASE_URL", "AGENT_MODEL_API_KEY", "AGENT_MODEL_ID"] as const;
export type ResponsesEnvironment = Readonly<Record<string, string | undefined>>;
export type ResponsesConfig = Readonly<{ protocol: "responses"; baseURL: string; apiKey: string; model: string; reasoning: "none" | "encrypted" }>;
const issued = new WeakSet<ResponsesConfig>();
export function missingResponsesConfig(env: ResponsesEnvironment = process.env): string[] {
  return RESPONSES_REQUIRED_ENV.filter((key) => !env[key]?.trim());
}
/** No OPENAI_* fallback, no .env loader, no URL guessing. Server configuration only. */
export function readResponsesConfig(env: ResponsesEnvironment = process.env): ResponsesConfig {
  if (missingResponsesConfig(env).length) throw new AgentRunError("AGENT_RESPONSES_CONFIG_MISSING");
  if (env.AGENT_MODEL_PROTOCOL !== "responses") throw new AgentRunError("AGENT_RESPONSES_PROTOCOL_UNSUPPORTED");
  const raw = env.AGENT_MODEL_BASE_URL!.trim();
  let url: URL;
  try { url = new URL(raw); } catch { throw new AgentRunError("AGENT_RESPONSES_URL_INVALID"); }
  const loopback = /^http:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?(?:\/|$)/.test(raw);
  const httpAllowed = env.APP_DEPLOYMENT_ENV === "development" && env.AGENT_MODEL_ALLOW_LOOPBACK_HTTP === "1" && loopback;
  if (!/^https?:\/\/[^/]+/.test(raw) || /^https?:\/\/[^/]*@/.test(raw) || (url.protocol !== "https:" && !(url.protocol === "http:" && httpAllowed)) || url.username || url.password || url.search || url.hash || /[?#\\\s]/.test(raw)
    || /\/responses\/*$/i.test(url.pathname) || /%|\/\//.test(url.pathname) || /\/\.{1,2}(?:\/|$)/.test(raw)
    || /(?:^|\.)api\.openai\.com\.?$/i.test(url.hostname)) {
    throw new AgentRunError("AGENT_RESPONSES_URL_INVALID");
  }
  const model = env.AGENT_MODEL_ID!.trim(); const apiKey = env.AGENT_MODEL_API_KEY!.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model) || !/^[!-~]+$/.test(apiKey) || apiKey.length > 4096) throw new AgentRunError("AGENT_RESPONSES_CONFIG_INVALID");
  const reasoning = env.AGENT_MODEL_REASONING_CONTINUATION ?? "none";
  if (reasoning !== "none" && reasoning !== "encrypted") throw new AgentRunError("AGENT_RESPONSES_CONFIG_INVALID");
  const config: ResponsesConfig = Object.freeze({ protocol: "responses", baseURL: url.href.replace(/\/+$/, ""), model, apiKey, reasoning });
  issued.add(config); return config;
}
export function assertResponsesConfig(config: ResponsesConfig): void {
  if (!issued.has(config)) throw new AgentRunError("AGENT_RESPONSES_CONFIG_INVALID");
}
