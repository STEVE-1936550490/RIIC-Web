import { expect, test, type Route } from "@playwright/test";
import type { AgentFinalResult } from "../src/server/agent/run-contract";
import { mockApis, mockAnonymousWebsiteSession, seedV4Session, planData } from "./production-readiness.fixture";
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});
function responseFor(route: Route): { success: boolean; requestId: string; data: AgentFinalResult } {
  const request = route.request().postDataJSON();
  return { success: true, requestId: "synthetic-request", data: {
    status: "ok", answer: "FAKE / TEST — synthetic answer", runId: "synthetic-run", contextRevision: request.context.contextRevision, modelMode: "fake_test", intent: null,
    sources: [{ type: "current_context", contextRevision: request.context.contextRevision, planDiagnosticId: "synthetic-plan", sampledAt: request.context.sampledAt, updatedAt: null, planId: null }],
    tools: [{ name: "current_plan.get_summary", step: 1, status: "ok", latencyMs: 1, code: null }], limitations: ["READ_ONLY_POC"],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, error: null,
  } };
}
test("panel interaction, fake result, sources, stop, retry, and stale revision", async ({ page }, info) => {
  test.skip(info.project.name !== "agent-enabled");
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData);
  let mode = "success"; let pending: Route | null = null;
  await page.route("**/api/agent", async (route) => {
    if (mode === "pending") { pending = route; return; }
    if (mode === "error") return route.fulfill({ status: 503, json: { success: false, error: { code: "AGENT_REQUEST_FAILED" } } });
    return route.fulfill({ json: responseFor(route) });
  });
  await page.goto("/"); await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.locator("[data-agent-open]").click(); const panel = page.locator("[data-agent-panel]");
  await expect(panel).toBeVisible(); await panel.getByLabel("问题", { exact: true }).fill("summary");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel.locator("[data-agent-answer]")).toContainText("FAKE / TEST");
  await expect(panel.getByRole("list", { name: "工具状态" })).toContainText("current_plan.get_summary");
  await expect(panel.getByRole("list", { name: "来源" })).toContainText("synthetic-plan");
  await panel.getByRole("button", { name: "Close", exact: true }).click(); await expect(panel).toBeHidden();
  await page.getByRole("tab", { name: /第 2 班/ }).first().click();
  await page.locator("[data-agent-open]").click();
  await expect(panel.getByRole("alert")).toContainText("STALE_CONTEXT"); await expect(panel.locator("[data-agent-answer]")).toHaveCount(0);
  await panel.getByRole("button", { name: "重试", exact: true }).click(); await expect(panel.locator("[data-agent-answer]")).toBeVisible();
  mode = "error"; await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("AGENT_REQUEST_FAILED");
  mode = "success"; await panel.getByRole("button", { name: "重试", exact: true }).click(); await expect(panel.locator("[data-agent-answer]")).toBeVisible();
  mode = "pending"; await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => pending !== null).toBe(true);
  await expect(panel.getByRole("status")).toBeVisible(); await panel.getByRole("button", { name: "停止", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("AGENT_ABORTED"); await expect(panel.locator("[data-agent-answer]")).toHaveCount(0);
  if (pending) await (pending as Route).abort().catch(() => {});
});
test("production flag disabled hides panel and rejects API", async ({ page, request }, info) => {
  test.skip(info.project.name !== "agent-disabled");
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData); await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-agent-open]")).toHaveCount(0);
  const response = await request.post("/api/agent", { data: { message: "summary", context: null } }); expect(response.status()).toBe(404);
});

test("three M0 scenarios render facts, planned/observed, candidates and deterministic comparison sources", async ({ page }) => {
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData);
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON(); const response = responseFor(route);
    const data = response.data;
    const source = { type: "saved_plan" as const, contextRevision: null, planDiagnosticId: "synthetic-saved", sampledAt: null, updatedAt: "2026-09-07T00:00:00.000Z", planId: "synthetic-left" };
    if (body.message.startsWith("room")) {
      data.answer = "FAKE / TEST — trade_1; shiftIndex: 0; planned: 贸易甲; observed: unavailable";
      data.tools[0].name = "current_plan.get_room_detail";
    } else if (body.message.startsWith("list")) {
      data.answer = "FAKE / TEST — candidates: 同名方案 [synthetic-left], 同名方案 [synthetic-right]。请选择 ID。";
      data.tools[0].name = "saved_plan.list";
      data.sources = [source, { ...source, planId: "synthetic-right" }];
    } else if (body.message === "compare synthetic-left synthetic-right") {
      data.answer = "FAKE / TEST — natural24h LMD: left 100; right 150; delta 50";
      data.tools[0].name = "saved_plan.compare";
      data.sources = [source, { ...source, planId: "synthetic-right" }];
    } else data.answer = "FAKE / TEST — shiftCount: 2; 不提供最优性证明。";
    return route.fulfill({ json: response });
  });
  await page.goto("/"); await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.locator("[data-agent-open]").click(); const panel = page.locator("[data-agent-panel]");
  if (process.env.AGENT_DEMO_PAUSE === "1") await page.pause();
  const send = async (message: string) => { await panel.getByLabel("问题", { exact: true }).fill(message); await panel.getByRole("button", { name: "发送", exact: true }).click(); };
  await send("summary"); await expect(panel.locator("[data-agent-answer]")).toContainText("shiftCount: 2");
  await expect(panel.getByRole("list", { name: "来源" })).toContainText("sampledAt:");
  await panel.getByLabel("问题", { exact: true }).fill("room trade_1 @0");
  await expect(panel.getByRole("alert")).toContainText("STALE_CONTEXT");
  await expect(panel.locator("[data-agent-answer]")).toHaveCount(0);
  await send("room trade_1 @0"); await expect(panel.locator("[data-agent-answer]")).toContainText("planned: 贸易甲; observed: unavailable");
  await expect(panel.getByRole("list", { name: "工具状态" })).toContainText("current_plan.get_room_detail");
  await send("list 同名方案"); await expect(panel.locator("[data-agent-answer]")).toContainText("同名方案 [synthetic-left], 同名方案 [synthetic-right]");
  await send("compare synthetic-left synthetic-right"); await expect(panel.locator("[data-agent-answer]")).toContainText("left 100; right 150; delta 50");
  const sources = panel.getByRole("list", { name: "来源" });
  await expect(sources).toContainText("synthetic-left"); await expect(sources).toContainText("synthetic-right"); await expect(sources).toContainText("updatedAt:");
  await expect(panel.locator("[data-agent-answer]")).not.toContainText("synthetic-foreign");
});

test("late response after close or changed question is never shown as current", async ({ page }) => {
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData);
  let pending: Route | undefined;
  await page.route("**/api/agent", (route) => { pending = route; });
  await page.goto("/"); await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.locator("[data-agent-open]").click(); const panel = page.locator("[data-agent-panel]");
  await panel.getByLabel("问题", { exact: true }).fill("summary");
  await panel.getByRole("button", { name: "发送", exact: true }).click(); await expect.poll(() => Boolean(pending)).toBe(true);
  const first = pending!; pending = undefined;
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await first.fulfill({ json: responseFor(first) }).catch(() => {});
  await page.locator("[data-agent-open]").click(); await expect(panel.locator("[data-agent-answer]")).toHaveCount(0);
  await panel.getByRole("button", { name: "发送", exact: true }).click(); await expect.poll(() => Boolean(pending)).toBe(true);
  await panel.getByLabel("问题", { exact: true }).fill("room trade_1 @1");
  await pending!.fulfill({ json: responseFor(pending!) });
  await expect(panel.getByRole("alert")).toContainText("STALE_CONTEXT"); await expect(panel.locator("[data-agent-answer]")).toHaveCount(0);
});
