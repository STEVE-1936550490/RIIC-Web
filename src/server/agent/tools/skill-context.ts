import { SKILL_CONTEXT_TOOL_NAME, parseSkillContextInput, parseSkillContextResult } from "../knowledge-contract.ts";
import { isIssuedActor, type AgentExecutionContext } from "../execution-context.ts";
import { AgentRunError } from "../run-contract.ts";
export const SKILL_CONTEXT_TOOL = Object.freeze({ name: SKILL_CONTEXT_TOOL_NAME, effect: "read" as const,
  description: "Read one operator building skill from existing structured game data and site manual annotation. Use exact stable IDs or names; null skillRef requires a unique skill. Keep the sources separate; absent means no manual note, unavailable means unknown. These sources do not establish a recommendation or optimality.",
  inputSchema: { type: "object", additionalProperties: false, required: ["operatorRef", "skillRef"], properties: {
    operatorRef: { type: "string", minLength: 1, maxLength: 100 }, skillRef: { type: ["string", "null"], minLength: 1, maxLength: 200 },
  } },
});
export { parseSkillContextInput };
export async function executeSkillContext(input: unknown, context: AgentExecutionContext) {
  if (!isIssuedActor(context.actor) || !context.knowledge) throw new AgentRunError("AGENT_TOOL_FORBIDDEN");
  return parseSkillContextResult(await context.knowledge.getSkillContext(context.actor, parseSkillContextInput(input), context.signal));
}
