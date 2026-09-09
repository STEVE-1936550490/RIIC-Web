import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution } from "./m3-test-support.ts";
import { approvedDeployment, consentFor } from "./egress-test-support.ts";
import { authorizeBusinessEgress } from "./business-egress.ts";
const { createModelPayloadBoundary, assertBusinessText } = await import("./model-payload-boundary.ts");
const { executeRegisteredTool } = await import("./tool-registry.ts");
import { createCompatibleLoopProvider } from "./compatible-provider.ts";
import { readModelConfig } from "./compatible-config.ts";
const { runReadOnlyAgent } = await import("./orchestrator.ts");
for (const [name, args] of [["current_plan.get_summary", {}], ["current_plan.get_room_detail", { roomRef: "trade_1", shiftIndex: null }], ["saved_plan.list", { query: null }], ["saved_plan.compare", { leftPlanId: "left", rightPlanId: "right" }]] as const) {
  test(`actual M2 ${name} result is minimized and future fields are rejected`, async () => {
    const result = await executeRegisteredTool(name, args, syntheticExecution()); const boundary = createModelPayloadBoundary();
    const safe = JSON.stringify(boundary.observation(name, result));
    assert.ok(safe.includes('"status":"ok"')); assert.ok(!safe.includes("synthetic-rev-1")); assert.ok(!safe.includes("diagnosticId")); assert.ok(!safe.includes("ownedOperatorCount"));
    for (const field of ["cookie", "apiKey", "sklandCredential", "databaseURL", "cliStderr", "futureInternalField", "box", "reasoning"]) {
      assert.throws(() => boundary.observation(name, { ...result, [field]: "FAKE_PRIVATE_DO_NOT_SEND" }), { code: "AGENT_MODEL_EGRESS_BLOCKED" });
    }
    if ("data" in result && result.data) assert.throws(() => boundary.observation(name, { ...result, data: { ...result.data, futureInternalField: "private" } }));
  });
}
test("saved-plan IDs use stable per-run aliases and cannot be resolved by another run", async () => {
  const result = await executeRegisteredTool("saved_plan.list", { query: null }, syntheticExecution()); const boundary = createModelPayloadBoundary();
  const safe = boundary.observation("saved_plan.list", result) as { plans: { id: string }[] };
  assert.match(safe.plans[0].id, /^plan-/); assert.notEqual(safe.plans[0].id, "left");
  assert.deepEqual(boundary.observation("saved_plan.list", result), safe);
  const call = { id: "c", name: "saved_plan.compare", arguments: { leftPlanId: safe.plans[0].id, rightPlanId: safe.plans[1].id } };
  assert.deepEqual(boundary.resolveCall(call).arguments, { leftPlanId: "left", rightPlanId: "right" });
  assert.throws(() => createModelPayloadBoundary().resolveCall(call));
  assert.throws(() => boundary.resolveCall({ ...call, arguments: { leftPlanId: "left", rightPlanId: "foreign" } }));
});
test("recognizable pasted credentials/diagnostics and poisoned titles cannot enter payloads", async () => {
  for (const value of ["Cookie: fake-cookie", "api_key=FAKE_KEY", "Skland: fake-cred", "credential=fake", "postgresql://fake:fake@fake/db", "stderr=private-text", "Bearer fake-token", "https://private.example.invalid/", "sk-fakecredential12345"]) assert.throws(() => assertBusinessText(value));
  const result = await executeRegisteredTool("saved_plan.list", { query: null }, syntheticExecution());
  if (!("plans" in result)) throw new Error();
  assert.throws(() => createModelPayloadBoundary().observation("saved_plan.list", { ...result, plans: result.plans.map((plan) => ({ ...plan, title: "Cookie: FAKE_KEY" })) }));
});
for (const protocol of ["chat_completions", "responses"] as const) test(`${protocol}: real adapter mock HTTP wire has minimized actual tools, alias refill, no raw IDs or diagnostics`, async () => {
  const ctx = syntheticExecution(); const approval = { ...approvedDeployment(), protocol }; let count = 0; const sent: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    count++; const body = JSON.parse(String(init?.body)); sent.push(String(init?.body));
    const toolResult = protocol === "chat_completions" ? body.messages.filter((m: { role: string }) => m.role === "tool").at(-1)?.content
      : body.input.filter((m: { type: string }) => m.type === "function_call_output").at(-1)?.output;
    const list = toolResult ? JSON.parse(toolResult) : null;
    if (count === 2) {
      assert.ok(list.plans.every((plan: { id: string }) => /^plan-[a-f0-9-]+$/.test(plan.id)));
      assert.ok(list.plans.every((plan: object) => !Object.hasOwn(plan, "diagnosticId") && !Object.hasOwn(plan, "pinned")));
    }
    if (count === 3) { assert.match(list.data.left.id, /^plan-/); assert.match(list.data.right.id, /^plan-/); }
    const name = count === 1 ? "saved_plan__list" : "saved_plan__compare";
    const args = count === 1 ? { query: null } : { leftPlanId: list?.plans?.[0].id, rightPlanId: list?.plans?.[1].id };
    const call = { id: `c${count}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
    const output = protocol === "chat_completions" ? { object: "chat.completion", id: "mock-completion", model: "synthetic", choices: [{ index: 0, finish_reason: count < 3 ? "tool_calls" : "stop", message: count < 3 ? { role: "assistant", content: "", tool_calls: [call] } : { role: "assistant", content: "Read-only comparison complete." } }] }
      : { id: "mock-response", object: "response", status: "completed", output: count < 3 ? [{ type: "function_call", call_id: `c${count}`, name, arguments: JSON.stringify(args) }] : [{ type: "message", id: "mock-message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Read-only comparison complete.", annotations: [] }] }] };
    return Response.json(output);
  };
  const provider = createCompatibleLoopProvider(readModelConfig({ AGENT_MODEL_PROTOCOL: protocol, AGENT_MODEL_BASE_URL: approval.endpoint, AGENT_MODEL_API_KEY: "synthetic-key", AGENT_MODEL_ID: "synthetic" }), fetcher);
  const egress = (await authorizeBusinessEgress(approval, ctx.actor.userId, consentFor(ctx.actor.userId), async () => true))!;
  const result = await runReadOnlyAgent({ context: ctx, message: "Compare my saved plans", provider, egress });
  assert.equal(result.status, "ok", JSON.stringify(result)); assert.equal(count, 3);
  assert.deepEqual(result.sources.map((source) => source.planId), ["left", "right"]);
  for (const request of sent) { assert.ok(!request.includes('"id":"left"')); assert.ok(!request.includes("diagnosticId")); assert.ok(!request.includes("synthetic-rev-1")); assert.ok(!request.includes("synthetic-owner")); }
  assert.match(sent[1], /plan-/); assert.match(sent[2], /solver_natural_24h/);
});
test("revocation between rounds blocks next mock model call; malicious errors never enter public result", async () => {
  const context = syntheticExecution(); let active = true; let calls = 0;
  const egress = (await authorizeBusinessEgress(approvedDeployment(), context.actor.userId, consentFor(context.actor.userId), async () => active))!;
  const result = await runReadOnlyAgent({ context, message: "summary", egress, provider: { kind: "external", async next() {
    calls++; active = false; return { decision: { type: "calls", calls: [{ id: "c", name: "current_plan.get_summary", arguments: {} }] } };
  } } });
  assert.equal(calls, 1); assert.equal(result.error, "AGENT_MODEL_EGRESS_BLOCKED");
  const permit = (await authorizeBusinessEgress(approvedDeployment(), context.actor.userId, consentFor(context.actor.userId), async () => true))!;
  const failed = await runReadOnlyAgent({ context, message: "private question", egress: permit, provider: { kind: "external", async next() { throw new Error("Cookie: fake-key https://private.example.invalid secret text"); } } });
  assert.equal(failed.error, "AGENT_PROVIDER_ERROR"); assert.ok(!JSON.stringify(failed).includes("private")); assert.ok(!JSON.stringify(failed).includes("fake-key"));
});
