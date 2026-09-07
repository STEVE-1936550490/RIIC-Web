import { readModelConfig, type ModelConfig, type ModelEnvironment } from "./compatible-config.ts";
import { createResponsesLoopProvider } from "./openai-loop-provider.ts";
import { createResponsesModelProvider } from "./openai-model-provider.ts";
import type { ResponsesConfig } from "./responses-config.ts";
import { createChatCompletionsLoopProvider, createChatCompletionsModelProvider } from "./chat-completions-provider.ts";
import type { ChatCompletionsConfig } from "./chat-completions-transport.ts";
import { createResponsesTransport } from "./responses-transport.ts";
import { createChatCompletionsTransport } from "./chat-completions-transport.ts";

export function createCompatibleLoopProvider(config: ModelConfig, fetcher: typeof fetch = fetch) {
  return config.protocol === "responses"
    ? createResponsesLoopProvider(config as ResponsesConfig, createResponsesTransport(config as ResponsesConfig, fetcher))
    : createChatCompletionsLoopProvider(config as ChatCompletionsConfig, createChatCompletionsTransport(config as ChatCompletionsConfig, fetcher));
}
export function createCompatibleModelProvider(config: ModelConfig, fetcher: typeof fetch = fetch) {
  return config.protocol === "responses"
    ? createResponsesModelProvider(config as ResponsesConfig, createResponsesTransport(config as ResponsesConfig, fetcher))
    : createChatCompletionsModelProvider(config as ChatCompletionsConfig, createChatCompletionsTransport(config as ChatCompletionsConfig, fetcher));
}
export function createCompatibleLoopProviderFromEnv(env: ModelEnvironment = process.env) { return createCompatibleLoopProvider(readModelConfig(env)); }
export function createCompatibleModelProviderFromEnv(env: ModelEnvironment = process.env) { return createCompatibleModelProvider(readModelConfig(env)); }
