import assert from "node:assert/strict";
import test from "node:test";
import { syntheticExecution, syntheticEgress } from "./m3-test-support.ts";
import { OpenAILoopProvider, type ToolCallingRequest } from "./openai-loop-provider.ts";
const { visibleTools } = await import("./tool-registry.ts");
test("Responses adapter maps strict tools, safe aliases, call IDs and outputs, without SDK types in Loop", async () => {
  const requests: ToolCallingRequest[] = [];
  const provider = new OpenAILoopProvider("synthetic-model", { async create(request, options) {
    requests.push(structuredClone(request)); assert.equal(options.maxRetries, 0); assert.ok(options.signal);
    return requests.length === 1 ? { output: [{ type: "function_call", call_id: "c1", name: "current_plan__get_summary", arguments: "{}" }] }
      : { output: [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "synthetic answer", annotations: [] }] }], usage: { totalTokens: 20 } };
  } });
  const request = { message: "summary", tools: visibleTools(syntheticExecution()), observations: [], egress: syntheticEgress, signal: new AbortController().signal };
  assert.deepEqual((await provider.next(request)).decision, { type: "calls", calls: [{ id: "c1", name: "current_plan.get_summary", arguments: {} }] });
  const second = await provider.next({ ...request, observations: [{ call: { id: "c1", name: "current_plan.get_summary", arguments: {} }, result: { status: "ok", synthetic: true } }] });
  assert.deepEqual(second.decision, { type: "final", answer: "synthetic answer" });
  assert.equal(requests[0].store, false); assert.equal(requests[0].tools?.length, 4);
  assert.ok(requests[1].input.some((item) => "type" in item && item.type === "function_call_output" && item.call_id === "c1"));
  for (const tool of requests[0].tools ?? []) { assert.equal(tool.type, "function"); if (tool.type === "function") assert.equal(tool.strict, true); }
});
test("adapter independently blocks business egress before transport and normalizes errors", async () => {
  let invoked = false;
  const provider = new OpenAILoopProvider("synthetic-model", { async create() { invoked = true; throw new Error("secret raw error"); } });
  const request = { message: "synthetic", tools: [], observations: [], signal: new AbortController().signal, egress: { classification: "user_business_context" as const, localTestApproved: true } };
  await assert.rejects(provider.next(request), { code: "AGENT_MODEL_EGRESS_BLOCKED" }); assert.equal(invoked, false);
  await assert.rejects(provider.next({ ...request, egress: syntheticEgress }), { code: "AGENT_PROVIDER_ERROR" });
});
