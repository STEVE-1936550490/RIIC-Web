import { AgentRunError, exact, text } from "./run-contract.ts";

export const SKILL_CONTEXT_TOOL_NAME = "knowledge.get_skill_context";
export type SkillContextInput = { operatorRef: string; skillRef: string | null };
export type KnowledgeObject = { id: string; name: string };
export type KnowledgeSource = {
  sourceType: "STRUCTURED_GAME_DATA" | "PROJECT_MANUAL_ANNOTATION";
  sourceId: string; operatorId: string; operatorName: string; skillId: string; skillName: string;
  version: string | null; revision: string; sampledAt: string; updatedAt: string | null;
  provenance: "arkntools/arknights-toolbox-data via RIIC-Web" | "RIIC-Web site-maintained manual annotation";
};
export type SkillContextResult = {
  status: "ok" | "missing" | "ambiguous";
  operator: KnowledgeObject | null;
  skill: (KnowledgeObject & { description: string; index: number; elite: number; level: number }) | null;
  annotation: { status: "available" | "absent" | "unavailable"; note: string | null; updatedAt: string | null };
  candidates: KnowledgeObject[];
  source: { type: "skill_knowledge"; entries: KnowledgeSource[] };
  limitations: string[];
  issue: { code: "KNOWLEDGE_OPERATOR_MISSING" | "KNOWLEDGE_SKILL_MISSING" | "KNOWLEDGE_OPERATOR_AMBIGUOUS" | "KNOWLEDGE_SKILL_AMBIGUOUS" } | null;
  truncation: { applied: boolean; omittedCount: number };
};
function invalid(): never { throw new AgentRunError("AGENT_INVALID_OUTPUT"); }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) invalid(); return value; }
function integer(value: unknown, max: number): number { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) invalid(); return Number(value); }
function timestamp(value: unknown): string { const s = text(value, 40); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s))) invalid(); return s; }
function object(value: unknown): KnowledgeObject { const o = exact(value, ["id", "name"]); return { id: text(o.id, 200), name: text(o.name, 100) }; }
export function parseSkillContextInput(value: unknown): SkillContextInput {
  const i = exact(value, ["operatorRef", "skillRef"]);
  const ref = (v: unknown, max: number) => { const s = text(v, max); if ([...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new AgentRunError("AGENT_INVALID_INPUT"); return s; };
  return { operatorRef: ref(i.operatorRef, 100), skillRef: i.skillRef === null ? null : ref(i.skillRef, 200) };
}
export function parseKnowledgeSource(value: unknown): KnowledgeSource {
  const s = exact(value, ["sourceType", "sourceId", "operatorId", "operatorName", "skillId", "skillName", "version", "revision", "sampledAt", "updatedAt", "provenance"]);
  if (s.sourceType !== "STRUCTURED_GAME_DATA" && s.sourceType !== "PROJECT_MANUAL_ANNOTATION") invalid();
  const structured = s.sourceType === "STRUCTURED_GAME_DATA";
  const provenance = structured ? "arkntools/arknights-toolbox-data via RIIC-Web" : "RIIC-Web site-maintained manual annotation";
  if (s.provenance !== provenance || !/^[a-f0-9]{64}$/.test(String(s.revision))) invalid();
  if (structured ? !/^[a-f0-9]{40}$/.test(String(s.version)) || s.updatedAt !== null : s.version !== null || s.updatedAt === null) invalid();
  const operatorId = text(s.operatorId, 100), skillId = text(s.skillId, 200);
  const sourceId = `${structured ? "skill" : "annotation"}:${operatorId}:${skillId}`;
  if (s.sourceId !== sourceId) invalid();
  return { sourceType: s.sourceType, sourceId, operatorId, skillId, operatorName: text(s.operatorName, 100), skillName: text(s.skillName, 100),
    version: structured ? String(s.version) : null, revision: String(s.revision), sampledAt: timestamp(s.sampledAt), updatedAt: s.updatedAt === null ? null : timestamp(s.updatedAt), provenance };
}
export function parseSkillContextResult(value: unknown): SkillContextResult {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 12000) invalid();
  const r = exact(value, ["status", "operator", "skill", "annotation", "candidates", "source", "limitations", "issue", "truncation"]);
  if (r.status !== "ok" && r.status !== "missing" && r.status !== "ambiguous") invalid();
  const operator = r.operator === null ? null : object(r.operator);
  let skill: SkillContextResult["skill"] = null;
  if (r.skill !== null) { const s = exact(r.skill, ["id", "name", "description", "index", "elite", "level"]); skill = { id: text(s.id, 200), name: text(s.name, 100), description: text(s.description, 1200), index: integer(s.index, 100), elite: integer(s.elite, 2), level: integer(s.level, 100) }; }
  const a = exact(r.annotation, ["status", "note", "updatedAt"]);
  if (a.status !== "available" && a.status !== "absent" && a.status !== "unavailable") invalid();
  if (a.status !== "available" && (a.note !== null || a.updatedAt !== null)) invalid();
  const annotation: SkillContextResult["annotation"] = { status: a.status, note: a.status === "available" ? text(a.note, 1000) : null, updatedAt: a.status === "available" ? timestamp(a.updatedAt) : null };
  const s = exact(r.source, ["type", "entries"]); if (s.type !== "skill_knowledge") invalid();
  const entries = list(s.entries, 2).map(parseKnowledgeSource);
  const candidates = list(r.candidates, 8).map(object);
  const t = exact(r.truncation, ["applied", "omittedCount"]); const omittedCount = integer(t.omittedCount, 10000);
  if (t.applied !== (omittedCount > 0)) invalid();
  const issue = r.issue === null ? null : exact(r.issue, ["code"]);
  const codes = ["KNOWLEDGE_OPERATOR_MISSING", "KNOWLEDGE_SKILL_MISSING", "KNOWLEDGE_OPERATOR_AMBIGUOUS", "KNOWLEDGE_SKILL_AMBIGUOUS"];
  if (issue && !codes.includes(String(issue.code))) invalid();
  if (r.status === "ok") {
    if (!operator || !skill || issue || candidates.length || entries.length !== (annotation.status === "available" ? 2 : 1)) invalid();
    if (entries[0].sourceType !== "STRUCTURED_GAME_DATA" || entries[1] && (entries[1].sourceType !== "PROJECT_MANUAL_ANNOTATION" || entries[1].updatedAt !== annotation.updatedAt)) invalid();
    if (entries.some(e => e.operatorId !== operator.id || e.operatorName !== operator.name || e.skillId !== skill.id || e.skillName !== skill.name)) invalid();
  } else if (skill || entries.length || !issue || annotation.status !== "unavailable" || !String(issue.code).endsWith(r.status.toUpperCase())) invalid();
  return { status: r.status, operator, skill, annotation, candidates, source: { type: "skill_knowledge", entries }, limitations: list(r.limitations, 8).map(v => text(v, 128)),
    issue: issue as SkillContextResult["issue"], truncation: { applied: t.applied as boolean, omittedCount } };
}

/** A deterministic extract, not model-authored citations or a ranking/solver explanation. */
export function skillContextAnswer(value: unknown): string {
  const r = parseSkillContextResult(value);
  if (r.status !== "ok" || !r.skill || !r.operator) return `技能引用 ${r.status}；请明确干员和技能。 / Clarify operator and skill.`;
  const note = r.annotation.status === "available" ? r.annotation.note : r.annotation.status === "absent" ? "absent：没有站点人工补充说明。 / No site annotation." : "unavailable：站点说明读取失败，不能判断是否存在。 / Annotation unavailable.";
  return `${r.operator.name} / ${r.skill.name} [${r.skill.id}]\n系统技能数据 / STRUCTURED_GAME_DATA：${r.skill.description}\n解锁 / Unlock: elite ${r.skill.elite}, level ${r.skill.level}; index ${r.skill.index}.\n站点人工补充说明 / PROJECT_MANUAL_ANNOTATION：${note}\n两种来源分别呈现，不代表官方声明；此处不证明推荐原因或最优性。 / Sources kept separate; no recommendation or optimality proof.`;
}

/** Deliberately bounded offline demo grammar; the server resolver remains authoritative. */
export function requestedSkillContext(message: string): SkillContextInput | null {
  // Existing explicit M0/M4 commands own their arguments, including arbitrary saved-plan titles.
  if (/^(?:summary$|解释当前方案$|(?:room|房间|list|已存方案|compare|比较|preview)\s)/i.test(message.trim())) return null;
  const command = /^skill\s+([^|]+?)(?:\s*\|\s*(.+))?$/i.exec(message.trim());
  const chinese = /^(.+?)的(.+?)(?:具体是什么效果|有没有站点补充说明|有什么效果)[？?]?$/.exec(message.trim());
  const english = /^(?:What does|Does) skill (.+?) of operator (.+?) (?:do|have a site annotation)\?$/i.exec(message.trim());
  const why = /^为什么这里建议(.+?)的(.+?)[？?]?$/.exec(message.trim());
  if (command) return { operatorRef: command[1].trim(), skillRef: command[2]?.trim() ?? null };
  const match = chinese ?? why;
  if (match) return { operatorRef: match[1], skillRef: match[2] === "基建技能" ? null : match[2] };
  return english ? { operatorRef: english[2], skillRef: english[1] } : null;
}
