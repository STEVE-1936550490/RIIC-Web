import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress, call } from "./m3-test-support.ts";
import { LocalDemoProvider, ScriptedLoopProvider } from "./fake-loop-provider.ts";
import { parseAgentFinalResult } from "./run-contract.ts";
const registry = await import("./tool-registry.ts");
const toolName = "knowledge.get_skill_context";
const target = { operatorRef: "char_002_amiya", skillRef: "control_tra_spd_000" };

test("M5 registers a narrow read capability", () => {
  assert.equal(registry.toolDescriptor(toolName).effect, "read");
  assert.equal(registry.toolDescriptor(toolName).inputSchema.additionalProperties, false);
});

// Dynamic imports keep the first red run an assertion about the missing capability.
async function setup(note: unknown = null) {
  const { createSkillKnowledgeService } = await import("../skill-knowledge-service.ts");
  const reads: unknown[] = [];
  const knowledge = createSkillKnowledgeService({ readAnnotation: async (...args) => { reads.push(args); return note; }, now: () => new Date("2026-09-18T00:00:00.000Z") });
  return { context: { ...syntheticExecution(), knowledge }, reads };
}
async function query(note: unknown = null, args: unknown = target) {
  const { context, reads } = await setup(note);
  const result = await registry.executeRegisteredTool(toolName, args, context);
  const { parseSkillContextResult } = await import("./knowledge-contract.ts");
  return { result: parseSkillContextResult(result), reads };
}
test("M5 resolves existing catalog facts and only reads the operator/skill pair", async () => {
  const { result, reads } = await query();
  assert.equal(result.status, "ok");
  assert.deepEqual(result.operator, { id: "char_002_amiya", name: "阿米娅" });
  assert.equal(result.skill?.name, "合作协议");
  assert.equal(result.skill?.description, "进驻控制中枢时，所有贸易站订单效率+7%（同种效果取最高）");
  assert.equal(result.skill?.index, 1);
  assert.equal(result.annotation.status, "absent");
  assert.equal(result.annotation.note, null);
  assert.deepEqual(reads, [["char_002_amiya", "control_tra_spd_000"]]);
  assert.equal(result.source.entries[0].sourceType, "STRUCTURED_GAME_DATA");
});
test("M5 annotation projection excludes creator/editor, row IDs and future DB internals", async () => {
  const { result } = await query({ note: "离线测试补充说明", updatedAt: "2026-09-05T00:00:00.000Z", id: "private-row", createdByUserId: "private-creator", updatedByUserId: "private-editor", createdAt: "private-audit", future: { secret: "private-future" } });
  assert.deepEqual(result.annotation, { status: "available", note: "离线测试补充说明", updatedAt: "2026-09-05T00:00:00.000Z" });
  assert.doesNotMatch(JSON.stringify(result), /private-|createdByUserId|updatedByUserId|createdAt|future/);
  assert.equal(result.source.entries[1].sourceType, "PROJECT_MANUAL_ANNOTATION");
});
for (const [args, status] of [
  [{ ...target, operatorRef: "不存在的干员" }, "missing"],
  [{ ...target, skillRef: "does_not_exist" }, "missing"],
  [{ ...target, skillRef: null }, "ambiguous"],
] as const) test(`M5 ${JSON.stringify(args)} is ${status}, never guesses or reads a note`, async () => {
  const { result, reads } = await query(null, args); assert.equal(result.status, status); assert.equal(reads.length, 0); assert.equal(result.source.entries.length, 0);
});
test("M5 reuses operator aliases and skill names", async () => {
  const { result } = await query(null, { operatorRef: "阿米娅(近卫)", skillRef: "合作协议" }); assert.equal(result.skill?.id, target.skillRef);
});
test("M5 duplicate operator or skill names remain ambiguous", async () => {
  const { resolveSkillKnowledgeTarget } = await import("../skill-knowledge-service.ts");
  const operators = [{ id: "a", name: "same", buildingSkills: [{ id: "s1", index: 1, elite: 0, level: 1 }, { id: "s2", index: 2, elite: 1, level: 1 }] }, { id: "b", name: "same", buildingSkills: [] }];
  const skills = { s1: { id: "s1", name: "shared", description: "first" }, s2: { id: "s2", name: "shared", description: "second" } };
  assert.equal(resolveSkillKnowledgeTarget({ operatorRef: "same", skillRef: null }, operators, skills).status, "ambiguous");
  assert.equal(resolveSkillKnowledgeTarget({ operatorRef: "a", skillRef: "shared" }, operators, skills).status, "ambiguous");
});
for (const key of ["userId", "actor", "tenant", "databaseId", "sql", "table", "path", "url", "acl", "adminIdentity", "source", "citation", "sourceOverride"]) test(`M5 rejects model argument ${key}`, async () => {
  const { context, reads } = await setup(); await assert.rejects(registry.executeRegisteredTool(toolName, { ...target, [key]: "forged" }, context), /AGENT_TOOL_INVALID_INPUT/); assert.equal(reads.length, 0);
});
test("M5 requires issued session actor at policy and service, ignoring serialized actor", async () => {
  const { context, reads } = await setup(); const forged = { ...context.actor };
  await assert.rejects(registry.executeRegisteredTool(toolName, target, { ...context, actor: forged }), /AGENT_TOOL_FORBIDDEN/);
  await assert.rejects(context.knowledge.getSkillContext(forged, target), /AGENT_TOOL_FORBIDDEN/);
  assert.equal(reads.length, 0);
});
test("M5 note failure is unavailable, never absent; cancellation performs no read", async () => {
  const { createSkillKnowledgeService } = await import("../skill-knowledge-service.ts");
  const context = syntheticExecution(); let reads = 0;
  const knowledge = createSkillKnowledgeService({ readAnnotation: async () => { reads++; throw Error("private-db-error"); } });
  const result = await knowledge.getSkillContext(context.actor, target);
  assert.equal(result.annotation.status, "unavailable"); assert.doesNotMatch(JSON.stringify(result), /private-db-error/);
  await assert.rejects(knowledge.getSkillContext(context.actor, target, AbortSignal.abort())); assert.equal(reads, 1);
});
test("M5 output schema rejects future fields, forged provenance and oversized notes", async () => {
  const { result } = await query(); const { parseSkillContextResult } = await import("./knowledge-contract.ts");
  for (const value of [{ ...result, future: true }, { ...result, skill: { ...result.skill, raw: {} } }, { ...result, source: { ...result.source, url: "https://attacker.invalid" } }, { ...result, annotation: { status: "available", note: "x".repeat(1001), updatedAt: "2026-09-05T00:00:00.000Z" } }]) assert.throws(() => parseSkillContextResult(value));
});
test("M5 fake selection, refill, server grounding and citations ignore hallucinated final text", async () => {
  const { runReadOnlyAgent } = await import("./orchestrator.ts"); const { context } = await setup();
  let refill = false;
  const provider = new ScriptedLoopProvider([call(toolName, target), async request => {
    refill = JSON.stringify(request.observations).includes("+7%"); return { type: "final", answer: "invented official annotation +999% https://attacker.invalid" };
  }]);
  const result = await runReadOnlyAgent({ context, message: "阿米娅的合作协议有没有站点补充说明？", provider, egress: syntheticEgress });
  assert.equal(refill, true); assert.equal(result.status, "ok"); assert.match(result.answer, /\+7%/); assert.match(result.answer, /absent/); assert.doesNotMatch(result.answer, /invented|999|attacker/);
  assert.equal(parseAgentFinalResult(result).sources[0].type, "skill_knowledge");
  assert.throws(() => parseAgentFinalResult({ ...result, sources: [{ ...result.sources[0], url: "https://attacker.invalid" }] }));
});
test("M5 external provider has no knowledge tool even for synthetic egress and forced calls", async () => {
  const { runReadOnlyAgent } = await import("./orchestrator.ts"); const { context, reads } = await setup();
  let rounds = 0;
  const provider = { kind: "external" as const, next: async (request: import("./loop-provider.ts").LoopRequest) => {
    assert.ok(request.tools.every(t => t.name !== toolName)); rounds++;
    return { decision: rounds === 1 ? call(toolName, target) : { type: "final", answer: "invented success" } };
  } };
  const result = await runReadOnlyAgent({ context, message: "skill", provider, egress: syntheticEgress });
  assert.equal(result.status, "failed"); assert.equal(reads.length, 0);
  const { createModelPayloadBoundary } = await import("./model-payload-boundary.ts");
  assert.throws(() => createModelPayloadBoundary().observation(toolName, {}), /AGENT_MODEL_EGRESS_BLOCKED/);
});
test("M5 external payload boundary rejects knowledge descriptors and forced calls before projection", async () => {
  const { context } = await setup(); const { createModelPayloadBoundary } = await import("./model-payload-boundary.ts");
  const boundary = createModelPayloadBoundary();
  assert.throws(() => boundary.request({ message: "skill", tools: registry.visibleTools(context), observations: [], signal: new AbortController().signal, egress: syntheticEgress }), /AGENT_MODEL_EGRESS_BLOCKED/);
  assert.throws(() => boundary.resolveCall(call(toolName, target).calls[0]), /AGENT_MODEL_EGRESS_BLOCKED/);
});
test("M5 payload builder rejects unclassified knowledge observations, including null", async () => {
  const { createModelPayloadBoundary } = await import("./model-payload-boundary.ts");
  const { result } = await query();
  for (const observation of [null, result, { ...result, futureInternalField: "PRIVATE" }]) {
    assert.throws(() => createModelPayloadBoundary().request({ message: "skill", tools: [],
      observations: [{ call: call(toolName, target).calls[0], result: observation }],
      signal: new AbortController().signal, egress: syntheticEgress,
    }), /AGENT_MODEL_EGRESS_BLOCKED/);
  }
});
test("M5 final skill extract cites only the observation used for its facts", async () => {
  const { context } = await setup({ note: "离线测试说明", updatedAt: "2026-09-05T00:00:00.000Z" });
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  const result = await runReadOnlyAgent({ context, message: "skill 阿米娅 | 小提琴独奏", egress: syntheticEgress,
    provider: new ScriptedLoopProvider([
      call(toolName, target), call(toolName, { operatorRef: "阿米娅", skillRef: "小提琴独奏" }, "call-2"),
      { type: "final", answer: "model final" },
    ]),
  });
  assert.equal(result.status, "ok"); assert.match(result.answer, /小提琴独奏/); assert.doesNotMatch(result.answer, /合作协议/);
  assert.equal(result.sources.length, 2);
  for (const source of result.sources) {
    assert.equal(source.type, "skill_knowledge");
    if (source.type === "skill_knowledge") assert.equal(source.knowledge.skillId, "dorm_rec_all_010");
  }
  assert.equal(parseAgentFinalResult(result).status, "ok");
});
test("M5 SQL read selects only note/update time, binds both IDs, never writes", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { skillAnnotationKnowledgeQuery } = await import("../skill-knowledge-read-server.ts");
  const query = skillAnnotationKnowledgeQuery(drizzle.mock(), "char_002_amiya", "control_tra_spd_000").toSQL();
  assert.match(query.sql, /^select "note", "updated_at" from "app"\."skill_annotation" where/);
  assert.match(query.sql, /"operator_id" = \$1/); assert.match(query.sql, /"skill_id" = \$2/); assert.match(query.sql, /limit \$3/);
  assert.deepEqual(query.params, ["char_002_amiya", "control_tra_spd_000", 1]);
  assert.doesNotMatch(query.sql, /created_by|updated_by|created_at|insert|update\s|delete/);
});
test("M5 public-row assumption requires review when annotation schema gains visibility or other fields", async () => {
  const { getTableColumns } = await import("drizzle-orm");
  const { skillAnnotation } = await import("../db/schema.ts");
  // Deliberate security audit gate: a new draft/private/tenant/etc column cannot silently inherit all-public semantics.
  assert.deepEqual(Object.keys(getTableColumns(skillAnnotation)).sort(), ["createdAt", "createdByUserId", "id", "note", "operatorId", "skillId", "updatedAt", "updatedByUserId"]);
});
test("M5 ambiguity candidates are bounded before any annotation read", async () => {
  const { OPERATOR_CATALOG } = await import("../../operatorPortraits.ts");
  const originalLength = OPERATOR_CATALOG.length;
  const fixture = OPERATOR_CATALOG.find(o => o.id === target.operatorRef)!;
  // In-memory duplicate fixtures only; the installed catalog files are never changed.
  try {
    OPERATOR_CATALOG.push(...Array.from({ length: 10 }, (_, i) => ({ ...fixture, id: `test_duplicate_${i}`, name: "M5 duplicate fixture" })));
    const first = await query(null, { operatorRef: "M5 duplicate fixture", skillRef: null });
    const second = await query(null, { operatorRef: "M5 duplicate fixture", skillRef: null });
    assert.equal(first.result.status, "ambiguous"); assert.equal(first.result.candidates.length, 8);
    assert.deepEqual(first.result.truncation, { applied: true, omittedCount: 2 });
    assert.deepEqual(first.result, second.result); assert.equal(first.reads.length, 0);
    const { parseSkillContextResult } = await import("./knowledge-contract.ts");
    assert.throws(() => parseSkillContextResult({ ...first.result, candidates: [...first.result.candidates, { id: "overflow", name: "overflow" }] }));
  } finally { OPERATOR_CATALOG.splice(originalLength); }
});
test("M5 cannot steal existing M0 commands whose saved-plan title resembles a skill question", async () => {
  const { context } = await setup(); const { runReadOnlyAgent } = await import("./orchestrator.ts");
  for (const message of ["list 阿米娅的合作协议有什么效果？", "已存方案 阿米娅的合作协议有什么效果？"]) {
    const result = await runReadOnlyAgent({ context, message, egress: syntheticEgress, provider: new LocalDemoProvider() });
    assert.equal(result.tools[0]?.name, "saved_plan.list"); assert.equal(result.status, "ok");
  }
});
test("M5 private record fields never reach refill or sources, even across valid actors", async () => {
  const { context } = await setup({ id: "PRIVATE_ROW", createdAt: "PRIVATE_CREATED", createdByUserId: "PRIVATE_CREATOR", updatedByUserId: "PRIVATE_EDITOR", future: "PRIVATE_FUTURE", note: "公开的离线测试说明", updatedAt: "2026-09-05T00:00:00.000Z" });
  const { actorFromWebsiteSession } = await import("./execution-context.ts");
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  for (const actor of [context.actor, actorFromWebsiteSession({ user: { id: "different-test-user" } }, "different-request")]) {
    const result = await runReadOnlyAgent({ context: { ...context, actor }, message: "skill 阿米娅 | 合作协议", egress: syntheticEgress,
      provider: new ScriptedLoopProvider([call(toolName, target), async request => {
        assert.doesNotMatch(JSON.stringify(request.observations), /PRIVATE_|createdByUserId|updatedByUserId|createdAt/);
        return { type: "final", answer: "invented note" };
      }]),
    });
    assert.equal(result.status, "ok"); assert.match(result.answer, /公开的离线测试说明/);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|different-test-user|invented note/);
  }
});
test("M5 read failure and failed Tool never become an invented confirmed annotation", async () => {
  const { createSkillKnowledgeService } = await import("../skill-knowledge-service.ts");
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  for (const failsAtTool of [false, true]) {
    const context = { ...syntheticExecution(), knowledge: failsAtTool ? { getSkillContext: async () => { throw Error("PRIVATE_DB_FAILURE"); } } : createSkillKnowledgeService({ readAnnotation: async () => { throw Error("PRIVATE_DB_FAILURE"); } }) };
    const result = await runReadOnlyAgent({ context, message: "skill 阿米娅 | 合作协议", egress: syntheticEgress,
      provider: new ScriptedLoopProvider([call(toolName, target), { type: "final", answer: "invented confirmed annotation" }]),
    });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DB_FAILURE|invented confirmed/);
    if (failsAtTool) { assert.equal(result.status, "failed"); assert.equal(result.sources.length, 0); }
    else { assert.match(result.answer, /unavailable/); assert.doesNotMatch(result.answer, /absent/); assert.equal(result.sources.length, 1); }
  }
});
test("M5 dependency graph never imports solver/private runtime/network or mutation services", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["./tools/skill-context.ts", "../skill-knowledge-service.ts", "../skill-knowledge-read-server.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /training_advice_knowledge|runtime-data|from ["'][^"']*(?:infra|planning-service|workspace|node:fs|child_process)|fetch\(|\.insert\(|\.delete\(/);
  }
});
test("M5 requested knowledge cannot succeed without a successful tool observation", async () => {
  const { context } = await setup(); const { runReadOnlyAgent } = await import("./orchestrator.ts");
  const result = await runReadOnlyAgent({ context, message: "阿米娅的合作协议具体是什么效果？", provider: new ScriptedLoopProvider([{ type: "final", answer: "imaginary +999%" }]), egress: syntheticEgress });
  assert.equal(result.status, "failed"); assert.doesNotMatch(result.answer, /999/);
});
test("M5 API uses session actor, rejects page actor/service injection, never constructs knowledge when external blocked", async () => {
  const { handleAgentRequest, agentApiDependencies } = await import("./agent-api.ts");
  const { context } = await setup(); let issuedReads = 0;
  const deps = { ...agentApiDependencies, config: () => ({ enabled: true, fakeAllowed: true }), session: async () => ({ user: { id: "m5-offline-user" } }),
    services: () => ({ savedPlans: context.savedPlans, comparison: context.comparison }), knowledge: () => ({ getSkillContext: async (...args: Parameters<typeof context.knowledge.getSkillContext>) => {
      assert.equal(args[0]?.userId, "m5-offline-user"); issuedReads++; return context.knowledge.getSkillContext(...args);
    } }), provider: () => new LocalDemoProvider() };
  const body = { message: "阿米娅的合作协议具体是什么效果？", context: null };
  const request = (value: unknown) => new Request("http://localhost/api/agent", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(value) });
  const response = await handleAgentRequest(request(body), deps); const result = (await response.json()).data;
  assert.equal(result.status, "ok"); assert.match(result.answer, /\+7%/); assert.equal(issuedReads, 1);
  for (const extra of [{ actor: context.actor }, { knowledge: {} }, { userId: "other" }]) assert.equal((await handleAgentRequest(request({ ...body, ...extra }), deps)).status, 400);
  const blocked = await handleAgentRequest(request(body), { ...deps, config: () => ({ enabled: true, fakeAllowed: false }), knowledge: () => { throw Error("MUST_NOT_CONSTRUCT"); } });
  assert.equal((await blocked.json()).data.error, "AGENT_MODEL_EGRESS_BLOCKED"); assert.equal(issuedReads, 1);
});
test("M5 business execution stays unavailable even with an offline issued provider approval", async () => {
  const { approvedDeployment, consentFor } = await import("./egress-test-support.ts");
  const { authorizeBusinessEgress } = await import("./business-egress.ts");
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  const { context, reads } = await setup(); let calls = 0;
  const approval = approvedDeployment();
  const egress = (await authorizeBusinessEgress(approval, context.actor.userId, consentFor(context.actor.userId), async () => true))!;
  const result = await runReadOnlyAgent({ context, message: "skill", egress, provider: { kind: "external", next: async request => {
    calls++; assert.ok(request.tools.every(t => t.name !== toolName));
    return { decision: call(toolName, target) };
  } } });
  assert.equal(result.status, "failed"); assert.equal(reads.length, 0); assert.ok(calls >= 1);
});
test("M5 source revision changes with note edits; sampling time is not a content version", async () => {
  const a = await query({ note: "测试 A", updatedAt: "2026-09-05T00:00:00.000Z" });
  const b = await query({ note: "测试 B", updatedAt: "2026-09-05T00:00:00.000Z" });
  assert.equal(a.result.source.entries[0].revision, b.result.source.entries[0].revision);
  assert.notEqual(a.result.source.entries[1].revision, b.result.source.entries[1].revision);
});
test("M5 conflicting site note remains separate; model-authored source references are rejected", async () => {
  const { parseLoopDecision } = await import("./loop-provider.ts");
  assert.throws(() => parseLoopDecision({ type: "final", answer: "claim", sources: [{ type: "official", url: "https://attacker.invalid" }] }));
  const { context } = await setup({ note: "离线冲突测试：此处为 +9%", updatedAt: "2026-09-05T00:00:00.000Z" });
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  const result = await runReadOnlyAgent({ context, message: "阿米娅的合作协议有没有站点补充说明？", provider: new LocalDemoProvider(), egress: syntheticEgress });
  assert.match(result.answer, /STRUCTURED_GAME_DATA：.*\+7%/); assert.match(result.answer, /PROJECT_MANUAL_ANNOTATION：.*\+9%/);
  assert.equal(result.sources.length, 2);
});
test("M5 LocalDemoProvider selects actual catalog skill from bilingual questions", async () => {
  const { runReadOnlyAgent } = await import("./orchestrator.ts");
  for (const message of ["阿米娅的合作协议具体是什么效果？", "What does skill control_tra_spd_000 of operator char_002_amiya do?"]) {
    const { context } = await setup(); const result = await runReadOnlyAgent({ context, message, provider: new LocalDemoProvider(), egress: syntheticEgress });
    assert.equal(result.tools[0]?.name, toolName); assert.match(result.answer, /\+7%/);
  }
});
