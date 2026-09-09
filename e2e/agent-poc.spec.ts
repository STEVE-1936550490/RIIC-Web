import { expect, test, type Route } from "@playwright/test";
import type { AgentFinalResult } from "../src/server/agent/run-contract";
import { mockApis, mockAnonymousWebsiteSession, seedV4Session, planData } from "./production-readiness.fixture";
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route("**/api/agent/consent*", (route) => {
    route.fulfill({ json: { success: true, data: { state: "fake_test", provider: null, binding: null } }});
  });
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

test("processing consent: required, grant, ready, revoke, outdated and provider unavailable (mock UI)", async ({ page }) => {
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData);
  let state = "consent_required"; let grants = 0; let revokes = 0; let modelRequests = 0;
  const binding = { consentVersion: "synthetic-consent", privacyVersion: "synthetic-privacy", providerProfileId: "synthetic", providerProfileVersion: "synthetic-v1", dataEgressPolicyVersion: "synthetic-egress" };
  await page.route("**/api/agent/consent", (route) => {
    if (route.request().method() === "POST") { expect(route.request().postDataJSON()).toEqual({ accept: true, binding }); grants++; state = "ready"; }
    if (route.request().method() === "DELETE") { revokes++; state = "consent_revoked"; }
    return route.fulfill({ json: { success: true, data: { state, provider: { displayName: "Synthetic Provider", links: ["https://provider.example.invalid/policy"] }, binding: state === "external_unavailable" ? null : binding } } });
  });
  await page.route("**/api/agent", (route) => { modelRequests++; return route.fulfill({ json: responseFor(route) }); });
  await page.goto("/"); await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.locator("[data-agent-open]").click(); const panel = page.locator("[data-agent-panel]");
  await panel.getByLabel("问题", { exact: true }).fill("summary"); const send = panel.getByRole("button", { name: "发送", exact: true });
  await expect(panel.locator('[data-agent-processing="consent_required"]')).toBeVisible(); await expect(send).toBeDisabled();
  expect(grants).toBe(0); await panel.getByRole("button", { name: "暂不启用", exact: true }).click(); await expect(send).toBeDisabled(); expect(modelRequests).toBe(0);
  await panel.getByRole("button", { name: "重新查看外部处理说明", exact: true }).click();
  await panel.getByRole("button", { name: "同意并启用外部模型", exact: true }).click();
  await expect(panel.locator('[data-agent-processing="ready"]')).toBeVisible(); await expect(send).toBeEnabled(); expect(grants).toBe(1);
  await send.click(); await expect(panel.locator("[data-agent-answer]")).toBeVisible(); expect(modelRequests).toBe(1);
  await panel.getByRole("button", { name: "撤回外部模型处理同意", exact: true }).click();
  await expect(panel.locator('[data-agent-processing="consent_revoked"]')).toBeVisible(); await expect(send).toBeDisabled(); expect(revokes).toBe(1); expect(modelRequests).toBe(1);
  for (const next of ["consent_outdated", "external_unavailable"]) {
    await panel.getByRole("button", { name: "Close", exact: true }).click(); state = next;
    await page.locator("[data-agent-open]").click(); await expect(panel.locator(`[data-agent-processing="${next}"]`)).toBeVisible(); await expect(send).toBeDisabled();
  }
  await expect(panel.getByRole("button", { name: "同意并启用外部模型", exact: true })).toHaveCount(0);
  expect(modelRequests).toBe(1);
});

test("planning preview running, success, failure, cancel, stale and no apply", async ({ page }) => {
  await mockApis(page); await mockAnonymousWebsiteSession(page); await seedV4Session(page, planData);
  let mode: "success" | "failure" | "pending" = "success"; let pending: Route | null = null;
  function previewResponse(route: Route) {
    const response = responseFor(route); const context = route.request().postDataJSON().context;
    response.data.tools = [{ name: "plan.preview", step: 1, status: mode === "failure" ? "unavailable" : "ok", latencyMs: 1, code: null }];
    response.data.answer = mode === "failure" ? "试算失败" : "FAKE / TEST — 未保存、未应用";
    response.data.status = mode === "failure" ? "failed" : "ok";
    response.data.preview = {
      status: mode === "failure" ? "unavailable" : "ok", semantics: "PREVIEW_ONLY", saved: "NOT_SAVED", applied: "NOT_APPLIED",
      assumptions: { rotationProfile: "abc_12_6_6", candidates: 1, data: "SYNTHETIC" },
      baseRevision: context.contextRevision, currentRevision: context.contextRevision,
      source: { type: "planning_preview", engine: "synthetic_mock_solver", contextRevision: context.contextRevision, sampledAt: context.sampledAt },
      computedAt: "2026-09-09T00:00:00.000Z", cacheHit: false,
      summary: mode === "failure" ? null : { shiftCount: 3, lmd: 120 },
      differences: mode === "failure" ? null : { shiftCount: { current: 2, preview: 3, delta: 1 }, lmd: { current: 100, preview: 120, delta: 20 } },
      issue: mode === "failure" ? { code: "AGENT_PREVIEW_SOLVER_FAILED" } : null,
      limitations: ["SYNTHETIC_MOCK_SOLVER_NOT_OPTIMALITY_EVIDENCE"], truncation: { applied: false, omittedCount: 0 },
    };
    return response;
  }
  await page.route("**/api/agent", async route => {
    if (mode === "pending") { pending = route; return; }
    await route.fulfill({ json: previewResponse(route) });
  });
  await page.goto("/"); await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.locator("[data-agent-open]").click(); const panel = page.locator("[data-agent-panel]");
  await panel.getByRole("checkbox", { name: "使用合成试算示例（仅顾问面板）" }).check();
  await panel.getByLabel("问题", { exact: true }).fill("如果把轮换改成 abc_12_6_6，试算一下。");
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
  const send = () => panel.getByRole("button", { name: "发送", exact: true }).click();
  await send(); const preview = panel.locator("[data-agent-preview]");
  await expect(preview).toContainText("Preview only"); await expect(preview).toContainText("未保存"); await expect(preview).toContainText("未应用");
  await expect(preview).toContainText("synthetic_mock_solver"); await expect(preview).toContainText("120"); await expect(preview).toContainText("revision:");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);
  mode = "failure"; await send(); await expect(preview).toContainText("试算失败，未生成候选方案");
  await expect(preview.locator("table")).toHaveCount(0);
  mode = "pending"; await send(); await expect(panel.getByRole("status")).toContainText("正在计算试算方案");
  await expect.poll(() => pending !== null).toBe(true);
  await panel.getByRole("button", { name: "停止", exact: true }).click(); await expect(panel.getByRole("alert")).toContainText("AGENT_ABORTED");
  if (pending) await (pending as Route).fulfill({ json: previewResponse(pending as Route) }).catch(() => {});
  await expect(preview).toHaveCount(0);
  mode = "success"; await send(); await expect(preview).toBeVisible();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: /第 2 班/ }).first().click();
  await page.locator("[data-agent-open]").click(); await expect(panel.getByRole("alert")).toContainText("STALE_CONTEXT");
  await expect(preview).toHaveCount(0);
  mode = "pending"; pending = null; await send(); await expect.poll(() => pending !== null).toBe(true);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  if (pending) await (pending as Route).fulfill({ json: previewResponse(pending as Route) }).catch(() => {});
  await page.locator("[data-agent-open]").click(); await expect(preview).toHaveCount(0);
});
