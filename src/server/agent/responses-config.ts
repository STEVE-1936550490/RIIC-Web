// Compatibility entry point: this factory still requires an explicit Responses protocol.
import { AgentRunError } from "./run-contract.ts";
import { MODEL_REQUIRED_ENV, missingModelConfig, readModelConfig, assertModelConfig, type ModelConfig, type ModelEnvironment } from "./compatible-config.ts";
export const RESPONSES_REQUIRED_ENV = MODEL_REQUIRED_ENV;
export type ResponsesEnvironment = ModelEnvironment;
export type ResponsesConfig = ModelConfig & { protocol: "responses" };
export const missingResponsesConfig = missingModelConfig;
export function readResponsesConfig(env: ResponsesEnvironment = process.env): ResponsesConfig {
  try {
    const config = readModelConfig(env);
    if (config.protocol !== "responses") throw new AgentRunError("AGENT_MODEL_PROTOCOL_UNSUPPORTED");
    return config as ResponsesConfig;
  } catch (error) {
    if (error instanceof AgentRunError) throw new AgentRunError(error.code.replace("AGENT_MODEL_", "AGENT_RESPONSES_"));
    throw error;
  }
}
export function assertResponsesConfig(config: ResponsesConfig): void {
  try { assertModelConfig(config); } catch { throw new AgentRunError("AGENT_RESPONSES_CONFIG_INVALID"); }
  if (config.protocol !== "responses") throw new AgentRunError("AGENT_RESPONSES_PROTOCOL_UNSUPPORTED");
}
