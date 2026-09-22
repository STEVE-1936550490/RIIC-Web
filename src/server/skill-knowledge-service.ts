import "server-only";
import { createHash } from "node:crypto";
import { OPERATOR_CATALOG, BUILDING_SKILL_CATALOG, operatorPresentationFor, type OperatorBuildingSkillRef } from "../operatorPortraits.ts";
import sourceManifest from "../generated/arkntools/source.json" with { type: "json" };
import { isIssuedActor, type ActorContext } from "./agent/execution-context.ts";
import { AgentRunError, record, text } from "./agent/run-contract.ts";
import { parseSkillContextInput, parseSkillContextResult, type SkillContextInput, type SkillContextResult, type KnowledgeSource } from "./agent/knowledge-contract.ts";

type Operator = { id: string; name: string; buildingSkills: OperatorBuildingSkillRef[] };
type Skill = { id: string; name: string; description: string };
/** Exact stable IDs/names only. Unlike UI display lookup, duplicates cannot pick a winner. */
export function resolveSkillKnowledgeTarget(input: SkillContextInput, operators: readonly Operator[] = OPERATOR_CATALOG, skills: Readonly<Record<string, Skill>> = BUILDING_SKILL_CATALOG) {
  let matches = operators.filter(o => o.id === input.operatorRef || o.id === `char_${input.operatorRef}` || o.name === input.operatorRef);
  if (!matches.length && operators === OPERATOR_CATALOG) {
    const alias = operatorPresentationFor({ name: input.operatorRef }).operator;
    if (alias) matches = operators.filter(o => o.id === alias.id);
  }
  if (matches.length !== 1) return { status: matches.length ? "ambiguous" as const : "missing" as const, operator: null, skill: null, candidates: matches.map(o => ({ id: o.id, name: o.name })), issue: { code: matches.length ? "KNOWLEDGE_OPERATOR_AMBIGUOUS" as const : "KNOWLEDGE_OPERATOR_MISSING" as const } };
  const o = matches[0]; const operator = { id: o.id, name: o.name };
  const refs = o.buildingSkills.filter(ref => input.skillRef === null || ref.id === input.skillRef || skills[ref.id]?.name === input.skillRef);
  if (refs.length !== 1 || !skills[refs[0].id]) return { status: refs.length > 1 ? "ambiguous" as const : "missing" as const, operator, skill: null,
    candidates: refs.flatMap(ref => skills[ref.id] ? [{ id: ref.id, name: skills[ref.id].name }] : []), issue: { code: refs.length > 1 ? "KNOWLEDGE_SKILL_AMBIGUOUS" as const : "KNOWLEDGE_SKILL_MISSING" as const } };
  const ref = refs[0], skill = skills[ref.id];
  return { status: "ok" as const, operator, skill: { id: ref.id, name: skill.name, description: skill.description, index: ref.index, elite: ref.elite, level: ref.level }, candidates: [], issue: null };
}
export type SkillKnowledgeService = ReturnType<typeof createSkillKnowledgeService>;
export function createSkillKnowledgeService(dependencies: {
  readAnnotation(operatorId: string, skillId: string): Promise<unknown | null>;
  now?: () => Date;
}) {
  return { async getSkillContext(actor: ActorContext | null, raw: unknown, signal?: AbortSignal): Promise<SkillContextResult> {
    if (!isIssuedActor(actor)) throw new AgentRunError("AGENT_TOOL_FORBIDDEN");
    signal?.throwIfAborted();
    const resolved = resolveSkillKnowledgeTarget(parseSkillContextInput(raw));
    const omittedCount = Math.max(0, resolved.candidates.length - 8);
    const result: SkillContextResult = { ...resolved, candidates: resolved.candidates.slice(0, 8), annotation: { status: "unavailable", note: null, updatedAt: null }, source: { type: "skill_knowledge", entries: [] },
      limitations: ["SOURCES_HAVE_NO_PRECEDENCE", "NOT_OFFICIAL_STATEMENT", "NO_RECOMMENDATION_OR_OPTIMALITY_PROOF"], truncation: { applied: omittedCount > 0, omittedCount } };
    if (resolved.status !== "ok" || !resolved.operator || !resolved.skill) return parseSkillContextResult(result);
    const operator = resolved.operator, skill = resolved.skill;
    const sampledAt = (dependencies.now?.() ?? new Date()).toISOString();
    const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const base = { operatorId: operator.id, operatorName: operator.name, skillId: skill.id, skillName: skill.name, sampledAt };
    const structured: KnowledgeSource = { ...base, sourceType: "STRUCTURED_GAME_DATA", sourceId: `skill:${operator.id}:${skill.id}`, version: sourceManifest.source.commit,
      revision: revision({ operator, skill }), updatedAt: null, provenance: "arkntools/arknights-toolbox-data via RIIC-Web" };
    result.source.entries.push(structured);
    // Validate the structured projection before any DB lookup; future/raw catalog fields never escape.
    parseSkillContextResult(result);
    try {
      const rawNote = await dependencies.readAnnotation(operator.id, skill.id);
      signal?.throwIfAborted();
      if (rawNote === null) result.annotation = { status: "absent", note: null, updatedAt: null };
      else {
        const row = record(rawNote);
        const annotation = { status: "available" as const, note: text(row.note, 1000), updatedAt: text(row.updatedAt, 40) };
        const source: KnowledgeSource = { ...base, sourceType: "PROJECT_MANUAL_ANNOTATION", sourceId: `annotation:${operator.id}:${skill.id}`, version: null,
          revision: revision({ operatorId: operator.id, skillId: skill.id, ...annotation }), updatedAt: annotation.updatedAt, provenance: "RIIC-Web site-maintained manual annotation" };
        // Validate atomically: malformed note/update metadata must not turn into an absent note.
        parseSkillContextResult({ ...result, annotation, source: { type: "skill_knowledge", entries: [structured, source] } });
        result.annotation = annotation; result.source.entries.push(source);
      }
    } catch { signal?.throwIfAborted(); result.limitations.push("ANNOTATION_READ_UNAVAILABLE"); }
    return parseSkillContextResult(result);
  } };
}
