import { expect, test, type Route } from "@playwright/test";
import { mockApis, mockAnonymousWebsiteSession, seedV4Session, planData } from "./production-readiness.fixture";
function responseFor(route: Route) {
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
