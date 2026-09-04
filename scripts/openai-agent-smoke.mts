import { createAgentIntentMessages } from "../src/server/agent/intent-prompt.ts";
import {
  AgentModelError,
  callStructuredAgentIntent,
} from "../src/server/agent/model-client.ts";
import {
  OpenAIModelConfigurationError,
  createOpenAIModelProviderFromEnv,
} from "../src/server/agent/openai-model-provider.ts";

const SYNTHETIC_INPUT = "看看贸易站 1 的情况";

if (process.env.RUN_OPENAI_AGENT_SMOKE !== "1") {
  console.log(JSON.stringify({
    status: "SKIPPED",
    reason: "Set RUN_OPENAI_AGENT_SMOKE=1 to opt in to one synthetic OpenAI request.",
  }));
} else if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error(JSON.stringify({ status: "BLOCKED_NO_API_KEY" }));
  process.exitCode = 2;
} else if (!process.env.AGENT_OPENAI_MODEL?.trim()) {
  console.error(JSON.stringify({ status: "BLOCKED_NO_MODEL_CONFIG" }));
  process.exitCode = 2;
} else {
  try {
    const result = await callStructuredAgentIntent({
      provider: createOpenAIModelProviderFromEnv(),
      messages: createAgentIntentMessages(SYNTHETIC_INPUT),
      timeoutMs: 30_000,
      maxOutputTokens: 256,
    });

    if (
      result.decision.intent !== "get_room_detail"
      || result.decision.roomRef !== "贸易站 1"
      || !result.decision.canProceed
    ) {
      console.error(JSON.stringify({
        status: "FAIL",
        code: "OPENAI_AGENT_SMOKE_UNEXPECTED_DECISION",
        decision: result.decision,
        metadata: result.metadata,
      }));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({
        status: "PASS",
        decision: result.decision,
        metadata: result.metadata,
      }));
    }
  } catch (error: unknown) {
    if (error instanceof AgentModelError || error instanceof OpenAIModelConfigurationError) {
      console.error(JSON.stringify({
        status: "FAIL",
        code: error.code,
        message: error.message,
      }));
    } else {
      console.error(JSON.stringify({
        status: "FAIL",
        code: "OPENAI_AGENT_SMOKE_UNEXPECTED_ERROR",
      }));
    }
    process.exitCode = 1;
  }
}
