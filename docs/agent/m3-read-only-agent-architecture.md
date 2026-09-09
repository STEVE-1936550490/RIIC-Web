# M3 safe read-only Agent PoC

This is a gated PoC, not production-ready. M0's three scenarios and four read-only tools are unchanged. M1's intent classifier remains an independently tested classifier; the main loop does not spend an extra model call on it.

## Runtime boundaries

`POST /api/agent` accepts only `{message, context}`: message <= 2,000 characters, body <= 40 KiB, context parsed by the compatible M2 schema 1 parser (<= 32 KiB). It reuses same-origin, website session, request ID, public envelopes and rate limits (20/IP/minute, 6/actor/minute). GET exposes only enabled/mode, with no-store.

Only a server website session can issue ActorContext. Policy filters Registry visibility and runs again before execution; M2 parses arguments again and saved-plan domain services enforce consent and object ownership. No Registry/Tool SQL, generic HTTP/shell tool or business write exists.

The run-scoped provider-neutral loop accepts tool calls or a final answer. Limits: 5 model steps, 6 total tool calls, 5 seconds/tool, 20 seconds/run, 16 KiB per observation/final DTO, 64 KiB accumulated observations, 3,000 answer characters, and 12,000 reported tokens. External output is capped at 1,800 tokens/call. Repeated identical name/arguments or reused call IDs stop the run. Cancellation/timeouts race non-cooperative promises; an already-issued read may finish internally, but no subsequent model step or late answer is accepted.

Tool results become bounded observations. Failed, missing or ambiguous results cannot be converted into a successful final answer: the orchestrator substitutes an explicit incomplete-result message. Sources come only from successful Tool outputs, never model-authored references. Current/observed sources retain separate sampledAt values; saved sources expose updatedAt, not a fabricated sampling time. Final DTOs contain answer, runId, revision, safe traces/usage, limitations and sources—not raw results, prompts, reasoning, actor or SDK responses.

Runs remain in memory. No Thread/Message/Run persistence or migration. Tool traces carry only name, step, status, stable code and latency under a runId; the HTTP envelope carries requestId. Existing HTTP error diagnostics receive newly constructed public errors without original causes or request bodies. No prompt, message, tool payload or provider error is logged.

## Egress and local demo

Every HTTP request is classified as user_business_context, regardless of client claims. External + business context always yields AGENT_MODEL_EGRESS_BLOCKED before provider construction/call—even if a compatible endpoint/key/model is configured. The loop and external adapter independently enforce egress before every step. M1 also defaults to business classification and rejects external egress unless a server caller explicitly supplies synthetic classification. No environment switch bypasses this rule.

AGENT_FEATURE_ENABLED defaults off. Local fake execution additionally requires AGENT_MODEL_MODE=fake and APP_DEPLOYMENT_ENV=development (or server test environment); production explicitly rejects fake execution. The browser cannot select mode/classification/actor. Only the enabled boolean reaches the rendered Workbench. UI always explains FAKE / TEST and privacy blocking.

The local demo is a deterministic command interpreter, not an intelligent model:

- `summary` / `解释当前方案`
- `room trade_1` / `房间 贸易站 1`; optional `@0` uses the zero-based shift index
- `list [title]`; duplicate titles remain separate candidates
- `compare leftID rightID`; list first to obtain authorized IDs

M3.5B retains the M3.5A Responses adapter and adds an explicitly selected Chat Completions adapter for M1/M3. Both use the same Loop, Registry, Policy, M2 services and egress rules. Shared config/SDK transport and safe HTTP diagnostics live in `compatible-config.ts` and `compatible-transport.ts`; `compatible-provider.ts` selects exactly one protocol. Chat keeps ordered assistant/tool history with matching IDs in one run, rejects malformed/refused/truncated output and unsupported reasoning continuation, and uses strict nested function schemas. The installed openai SDK is transport infrastructure, not supplier identity. No official endpoint/model or legacy credential defaults are used. The adapter implements strict schemas, canonical-name aliases, call_id/output matching and private run-scoped continuation. Encrypted reasoning is an explicit optional capability, disabled by default; unsupported necessary continuation fails closed. `store=false` does not promise third-party zero retention. See [dual-protocol configuration, synthetic acceptance and limitations](compatible-provider.md) and [Responses continuation/history](responses-compatible-provider.md).

## Workbench and verification

The existing right-side Sheet hosts the advisor. Plan, layout, active shift, observed snapshot or account changes advance the page revision. Each request captures its revision; mismatched returned/current revisions display STALE_CONTEXT and hide the old answer. Changing the question also invalidates the prior answer, including a late response for another room command. Stop/close/unmount abort fetch and ignore late responses. Nothing is stored in localStorage or a database by the panel.

`npm run test:agent` runs Agent contracts, runtime, API and offline provider tests. `npm run test:agent:golden` runs 25 synthetic cases. The Golden Set checks routing/arguments, allowed/forbidden tools, facts, ambiguity, authorization, failures, repeat protection and stale revision; it is not an evaluation of an actual LLM's intelligence.

Browser tests use synthetic Workbench fixtures and mocked Agent responses: four cases cover enabled interactions, all three M0 result presentations, late responses and disabled production. API tests separately execute the real API handler → fake provider → real M2 chain. Both protocol mock-HTTP suites verify SDK serialization → Loop → actual M2. No layer is evidence of real-model end-to-end acceptance.

Build and browser work must use an isolated copy containing the current uncommitted source, not just old HEAD. The [local demo and acceptance runbook](m3-local-demo.md) provides commands, concrete supported questions, cleanup and future endpoint acceptance. `agent-offline-command.mjs` supplies an explicit environment without model settings/old opt-ins; build uses `ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack`. Browser tests start enabled-development and disabled-production standalone servers on newly selected loopback ports and never reuse existing servers; screenshots/traces are disabled. The product feature flag remains off by default.

The cloud-enabled webpack path is validated in this closeout. Historical cloud-disabled alias/runtime (`setActiveShift` on null) and Turbopack CSS-worker EPERM records are not claims of permanent framework defects and do not replace this round’s required webpack evidence.

The historical REAL_OPENAI_SMOKE remains PENDING_NO_API_KEY, but is no longer the active acceptance target or a requirement for an official key. Historical M3.5A REAL_RESPONSES_ENDPOINT_VALIDATION is CAPABILITY_INCOMPATIBLE with ROOT_CAUSE=UNRESOLVED, as recorded in the newer status closeout. M3.5B REAL_ENDPOINT_VALIDATION is NOT_RUN because real model calls are not authorized; both protocol commands default offline. REAL_USER_CONTEXT_TO_EXTERNAL_MODEL remains BLOCKED_PRIVACY. Next: separately authorize and accept the chosen endpoint using synthetic fixtures, then independently review privacy; no M4, writes, solver, RAG, memory or multi-agent work.

## M3.6 External Model Business Data Egress Boundary

2026-09-08 增加独立的 `processing-access` / `provider-data-policy` / `processing-consent` 发布边界。在 external provider factory 与领域 services 构造之前，API 核对 feature、business kill switch、经审阅 Profile、endpoint/protocol/Profile version、Privacy/Egress version 以及 Session 用户当前 Consent。拒绝时不读取为模型准备的额外领域数据、不构造客户端、不发送模型 HTTP。

Gate 产生 WeakMap 认证的进程内许可，绑定用户和单个 run；克隆/伪造许可不能使用。Loop 每轮白名单构造载荷，核对许可并重读 Consent；两协议 adapter 再次核对 endpoint、protocol、run 和载荷完整性。普通 Run/Tool/token/result/count/cancel 预算不变。已开始的 HTTP 无法追回，但撤回会阻断以后开始的发送。

`model-payload-boundary` 路径级投影独立于领域 DTO；额外字段拒绝，已分类不必要字段删除，saved plan IDs 本轮别名化。domain service 仍收到经映射的真实 ID 并执行原 consent/ownership/retention。真实 sources 留在 API DTO，不由模型生成。完整快照没有直接进入 Prompt。Responses encrypted continuation 和 M1 classifier 未批准业务载荷，保留 synthetic 行为且 business fail-closed。

新增 `/api/agent/consent` 及独立迁移只存政策状态，不给 Agent 新工具。面板显式 opt-in、拒绝和撤回，核心工作台不依赖该选择。细节见 [Data Map](./model-egress-data-map.md)、[Provider 证据](./provider-data-processing.md)、[Runbook](./external-processing-runbook.md)。当前目录没有 approved Provider，MoMA 仍 `BLOCKED_UNVERIFIED_PROCESSING`。

## M4 compute-only extension — 2026-09-09

The separately authorized [M4 compute-only preview](m4-read-only-planning-preview.md) adds `plan.preview` only for an explicitly requested, server-bound synthetic scenario in fake mode. Four M0 read tools retain their behavior. The shared planning service owns validation, cache, admission, existing solver/record/public-DTO boundaries; preview never saves/applies a plan or changes Workspace. The optional final `preview` DTO is deterministic and independently parsed; model text does not establish compute success. External providers cannot receive this new tool under the current M3.6 field policy, and business egress remains BLOCKED_PROVIDER_POLICY.
