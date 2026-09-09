# Compatible model protocols — M3.5B

The provider layer supports explicitly selected **Responses** and **Chat Completions** protocols. Protocol, endpoint, supplier, model ID and SDK are independent. The installed `openai` SDK is retained as the HTTP client; neither MoMA nor the official OpenAI service is a default supplier. Compatibility is limited to the documented request shapes below and requires acceptance of each endpoint + protocol + model + code version.

## Configuration and entry points

`readModelConfig` in `src/server/agent/compatible-config.ts` validates server configuration. `createCompatibleLoopProvider` and `createCompatibleModelProvider` in `compatible-provider.ts` select the appropriate adapter; their `FromEnv` variants use the same validation. Historical Responses factories remain Responses-only and reject a Chat configuration.

| Variable | Contract |
| --- | --- |
| `AGENT_MODEL_PROTOCOL` | Required: exactly `responses` or `chat_completions` |
| `AGENT_MODEL_BASE_URL` | Required API root, with the endpoint's documented path prefix |
| `AGENT_MODEL_ID` | Required explicit model ID; never used to guess protocol |
| `AGENT_MODEL_API_KEY` | Required endpoint credential, injected as a secret |
| `AGENT_MODEL_REASONING_CONTINUATION` | Default `none`; `encrypted` only for Responses with documented support |
| `AGENT_MODEL_ALLOW_LOOPBACK_HTTP` | Exact loopback HTTP only with `1` and `APP_DEPLOYMENT_ENV=development` |

For `https://gateway.example.invalid/custom/v1`, Responses sends only `POST /custom/v1/responses`; Chat sends only `POST /custom/v1/chat/completions`. `/v1` is never guessed or inserted. Complete `/responses` and `/chat/completions` URLs are rejected for both protocols, including trailing slashes and case variants. URL userinfo, query, fragment, encoded/ambiguous paths and non-loopback HTTP are rejected. The existing official model host rejection is retained; this task does not relax endpoint policy.

There are no legacy `OPENAI_*` credential/address defaults, `.env` loaders, protocol fallback, endpoint probing, parameter-removal retries or model-name heuristics. The shared SDK factory replaces inherited headers, disables logging, sets retries to zero, rejects redirects and retains normal TLS verification. Each request is capped at 15 seconds. Existing 5-step / 6-tool / 20-second / 12,000-reported-token run budgets and result limits remain in the shared orchestrator.

## Protocol contracts

| Capability | Responses | Chat Completions |
| --- | --- | --- |
| Basic request | `input`, `store=false`, `max_output_tokens` | `messages`, `store=false`, `stream=false`, `n=1`, `max_completion_tokens` |
| Function definitions | Top-level function fields, `strict=true` | Nested `function`, `strict=true`, `tool_choice=auto` |
| Tool names | Canonical dotted names mapped to reversible aliases | Same aliases and Registry |
| Tool results | `function_call_output.call_id` | `role=tool`, `tool_call_id`, JSON `content` |
| JSON output probe | `text.format.type=json_object` | `response_format.type=json_object` |
| Strict M1 output | `text.format` with the existing intent JSON schema | `response_format.json_schema` with the same schema |
| Usage | input/output/total tokens | prompt/completion/total tokens mapped to shared usage |
| Continuation | Existing run-scoped message/function/encrypted-reasoning support | Run-scoped assistant/tool messages; unsupported reasoning extensions fail closed by default; explicit synthetic legacy discards side channels |

Both adapters reuse the same instructions, Agent Loop, Registry, Policy, M2 domain authorization, budgets, egress rules and code-generated sources. Missing or malformed arguments/IDs, duplicate IDs, unknown tool aliases, incomplete refill and cross-run reuse fail closed. Chat preserves all calls in a multi-call assistant message and inserts each matching tool result exactly once. Deprecated `function_call`, extra choices, streaming, truncated output, refusal, malformed envelopes and unsupported necessary reasoning state are rejected. No hidden reasoning is returned, persisted or printed. Chat does not claim support for all vendor-specific reasoning formats, legacy `max_tokens`-only servers or non-strict tool schemas.

Strict JSON and JSON mode are separate probes. A successful JSON-mode probe does not enable a weaker runtime schema. Local intent parsing and Tool validation remain mandatory. Missing usage is reported as unavailable, not as evidence of zero cost.

## Safe diagnostics

The transport returns stable errors, with an optional bounded diagnostic containing HTTP status, fixed category, exact allowlisted upstream code/type (unknown values become `UNKNOWN`) and `rootCause=UNRESOLVED`. Arbitrary upstream messages, parameters, request IDs, URLs, headers, response bodies and error causes are discarded.

| Evidence | Category / stable suffix |
| --- | --- |
| 401 / 403 | `authentication_error` / `AUTH_FAILED` |
| Allowlisted `model_not_found` or `invalid_model` | `configuration_error` / `CONFIG_INVALID` |
| 404 / 405 without a recognized model error | `route_incompatibility` / `ROUTE_INCOMPATIBLE` |
| 400 / 422 | `capability_incompatibility` / `CAPABILITY_INCOMPATIBLE` |
| 429 | `provider_error` / `RATE_LIMITED` |
| 5xx | `provider_error` / `SERVER_ERROR` |
| Other API/network failures | `provider_error` / `NETWORK_ERROR` |
| Timeout / cancellation | `timeout` / `cancelled` |
| Redirect / malformed or truncated response | `redirect` / `response_format` |
| Required unsupported continuation | `continuation` |
| Tool behavior or fact validation | `tool_behavior` |
| Local request/run budget | `budget` |

Protocol errors use `AGENT_RESPONSES_*` or `AGENT_CHAT_*`; configuration uses `AGENT_MODEL_*`. Timeout and cancellation retain shared codes. These categories describe the observed request failure; HTTP 404 alone cannot establish a supplier-wide capability limitation. Synthetic summaries retain these safe diagnostics even when the error occurs in a later tool round. Normal browser/API DTOs continue to expose only their existing safe error contract.

## Synthetic acceptance (requires separate authorization to run)

| Command | Required opt-in |
| --- | --- |
| `npm run smoke:agent:compatible` | `RUN_COMPATIBLE_AGENT_SMOKE=1`; follows the explicit protocol |
| `npm run smoke:agent:responses` | `RUN_RESPONSES_AGENT_SMOKE=1`; requires `responses` |
| `npm run smoke:agent:chat-completions` | `RUN_CHAT_COMPLETIONS_AGENT_SMOKE=1`; requires `chat_completions` |

All three commands accept `--mode basic` or `--mode full` and the bounded synthetic options below (after npm’s `--`); default mode is **basic**. Invalid arguments fail before HTTP. Each command defaults to zero requests without complete configuration and its own opt-in. They are not part of ordinary tests or `npm run check`. A legacy or other protocol's opt-in cannot activate them. Commands accept only built-in synthetic fixtures, a synthetic actor and in-memory repositories; no website session, real database, Workspace, Box, page snapshot or Skland data is loaded. Use deployment secret injection or hidden shell input for the key, never chat, command arguments, Git or documentation.

Basic mode permits **1 HTTP attempt** and checks only `basicCompletion`; other capabilities are `BLOCKED` with zero attempts. Full mode permits **12 HTTP attempts total**, including failures, and reports these capabilities separately:

1. `basicCompletion`: exact synthetic reply. Failure blocks all dependent probes (`BLOCKED`, not independent failures).
2. `jsonOutput`: JSON mode and local exact synthetic-object validation.
3. `strictStructuredOutput`: existing M1 intent schema and semantic parser. JSON and strict probes are independent; neither failure changes parameters for the other probes.
4. `current`: automatic summary + room calls, valid arguments and call IDs, actual M2 execution, result refill, resolved active shift, planned operators, explicitly unavailable observed data, final facts and code-generated source verification.
5. `saved`: automatic list → compare → answer across multiple rounds; IDs must come from the authorized list; foreign-owner data stays absent. Checks deterministic 100/150/50 values and both sources. A local negative control also invokes the actual Registry/M2 to reject a foreign-owner comparison; it is not fabricated into model observations and adds no HTTP attempt.

After basic success, JSON/strict/current/saved are independent assessments: an M1 strict failure alone does not prove M3 tools unsupported. Authentication/permission, rate limit, server/network, timeout/cancellation, redirect, configuration or budget failure stops subsequent attempts; unexecuted capabilities are `BLOCKED`, never independent FAIL/UNSUPPORTED. Full overall PASS requires every required capability; basic PASS says nothing about strict/tools.

`functionToolLoop` passes only when both business scenarios pass. Nonempty prose or HTTP 200 cannot substitute for Tool execution, correct facts or sources. Offline SDK tests exercise abort, timeout, malformed/refused/truncated output, duplicate/missing IDs, history isolation, errors, request budgets and egress independently; the live runner does not fabricate those failures by making additional model requests. Multiple tool calls are accepted but not forced, so synthetic PASS is not a forced-parallel-tools claim.

Summaries contain endpoint hash, protocol, requested/reported model, request-shape version (`m3.5b-strict-tools-v1`), mode/request limit, total and per-capability attempt counts, stage, capability outcomes, safe diagnostics and usage availability. Record the code SHA and any uncommitted patch separately with acceptance evidence. Reported model is an unverified endpoint assertion. Narrow fact checks are not a general semantic evaluator; one valid strict result cannot prove universal server-side strict enforcement.

## Explicit synthetic compatibility options — 2026-09-08

The existing synthetic CLI accepts `--chat-legacy-compat`, `--agent-strict-ms`, `--agent-total-ms`, and `--agent-tool-ms` alongside `--mode basic|full`. All options are parsed once and passed into the existing runner; no broker or second Agent Loop is required. Old `ACCEPTANCE_*` environment variables are ignored. The command still requires its own opt-in and explicit validated model configuration. Invalid, duplicate, unknown or out-of-range arguments fail before HTTP.

| Behavior | Default strict request mode | Explicit Chat legacy mode |
| --- | --- | --- |
| Selection | Default for both protocols | Only explicit synthetic `--chat-legacy-compat`; rejected with Responses |
| Request fields and prompts | Existing protocol fields; Chat-only schema-bearing system instruction | Identical to default Chat: no request-field or prompt changes |
| Structured format | `json_schema`, `strict=true` | Same; never automatically changed to `json_object` |
| Tool definitions and limits | `strict=true`, `tool_choice=auto`; 1800 token cap, store=false, stream=false, n=1, retries=0 | Identical |
| Chat side channels | Non-null reasoning/reasoning_content/reasoning_details/audio rejected | Discarded when constructing allowlisted protocol history; input is not mutated |
| Deprecated function_call | Rejected | Rejected: no generated call IDs |
| Structured parsing | Whole response must parse as JSON, then client Schema and semantic validation | Identical; fenced/embedded JSON is rejected |
| Tool content | Empty string allowed only with valid tool calls, object arguments and IDs | Identical; empty final answers and malformed calls rejected |
| Local safety | Parameters/results, domain authorization, server actor, source whitelist and egress enforced | Identical |

Neither supplier, domain nor model name enables legacy mode. It does not select another protocol/model or retry a failed strict request. Its side-channel discard cannot guarantee safe continuation for arbitrary reasoning models. Summary `compatibilityMode` distinguishes `default_strict` from `explicit_chat_legacy`; the retained request-shape version alone is insufficient to identify the mode. A valid client result is not proof that the server reliably enforces Schema. Do not label legacy success as default-mode acceptance or use the ambiguous label “strict PASS”.

| Option | Default / finite maximum (ms) | Actual scope |
| --- | --- | --- |
| `--agent-strict-ms` | 15000 / 30000 | Outer `callStructuredAgentIntent` cancellation budget for the structured probe; independent of totalMs |
| `--agent-total-ms` | 20000 / 60000 | Shared Loop total elapsed budget for each current/saved scenario separately; not all of full mode |
| `--agent-tool-ms` | 5000 / 12000 | Per-tool waiting deadline, bounded by scenario remaining time; not HTTP timeout |

All values must be whole positive decimal integers. Chat HTTP remains capped at 15000 ms even with strictMs=30000. Loop cancellation and total-time checks remain active; tool waiting is bounded but underlying non-cooperative domain work is not claimed to be forcibly terminated. Extended Loop deadlines require an explicit server-owned synthetic invocation; normal `/api/agent` retains 20000/5000 ms and cannot accept these options. Limits are per invocation and do not mutate globals. The historical broker's 180-second child timeout and control client's 240-second socket wait are outside these three budgets and are not product settings.

The archived implementation had wider behavior: global environment switches, fenced/embedded JSON extraction, generated legacy function-call IDs and uncapped shared deadline overrides. These are not the final delivery behavior. No automatic json_schema → json_object fallback exists in the baseline, archived patch or final code. The independent jsonOutput probe remains explicit.

## Historical MoMA report and evidence limits — 2026-09-08

User/server execution reported endpoint root `https://moma.cmecloud.cn/v1`, protocol `chat_completions`, model `zhipu/glm-5.3`, explicit `--chat-legacy-compat`, and 30000/60000/12000 ms as scoped above. The historical report was basic/full PASS, **9 additional HTTP attempts** (1 basic + 8 full), broker cumulative **26/100**. These are historical counts, not this offline round's requests or authorization.

PASS applies only to that configuration and the checked outputs. Client Schema validation passed; reliable server-side enforcement is unproven. WorkBuddy's Schema counterexample is user-reported without original evidence. The earlier CURRENT failing assertion is unresolved. Successful-run source hashes, exact start/end times and environment snapshot are missing, so `HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED`. Archive integrity and current-file correspondence do not resolve this gap. This round did not rerun real acceptance, and the revised final code cannot inherit the historical real-endpoint PASS. Prior Responses failures and the earlier Chat continuation failure remain separate historical evidence in implementation status.

## Delivery and privacy

The original engineering delivery ran **offline validation only** and recorded M3.5B `REAL_ENDPOINT_VALIDATION=NOT_RUN` at that checkpoint. A subsequently authorized, user-run Chat basic attempt on `74ae80e` made one HTTP attempt and failed with `AGENT_CHAT_CONTINUATION_UNSUPPORTED`; full capabilities were not executed. Its summary cannot identify the triggering field or establish required continuation semantics. No supplier-wide capability claim follows. That earlier result, the 2026-09-08 legacy report above, and historical M3.5A Responses failure evidence are recorded separately in [implementation status](implementation-status.md).

`REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY` remains unchanged. Configuration and synthetic success do not authorize real business egress, including to a private gateway. Normal `/api/agent` traffic remains business context and is blocked before constructing an external provider; clients cannot select protocol, endpoint, actor or synthetic classification. `store=false` is a protocol option, not a third-party retention/training guarantee. M0 stays read-only; no M4, writes, solver, RAG, persistence or product multi-agent behavior is introduced.

For isolated offline validation, the three-layer evidence and separately authorized basic/full command examples, see [the local demo and acceptance runbook](m3-local-demo.md).

## M3.6：兼容性与处理批准分离（2026-09-08）

历史 MoMA Chat synthetic 配置 PASS 仅是协议兼容证据；`HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED` 不变，不能推导当前代码/未来 commit 的真实验收或隐私授权。保留上述 Responses 历史失败和证据限制。

本轮新增 [Provider Data Processing Profile](./provider-data-processing.md) 和 [字段白名单](./model-egress-data-map.md)。MoMA 的 API 保留、训练/改进用途、适用数据处理条款未取得充分官方证据；`MOMA_BUSINESS_CONTEXT_RELEASE=BLOCKED_UNVERIFIED_PROCESSING`。`store=false` 与客户端 Schema PASS 均不证明服务端保留/训练或 strict enforcement。

普通业务配置仍默认严格请求，不启用 `--chat-legacy-compat`；显式 legacy、30000/60000/12000 扩展预算继续只属 synthetic acceptance。新增 Provider 批准和 Consent 不绕过本地 schema/语义/工具授权、Responses 安全契约或四工具只读边界。真实模型请求预算本轮 0。工程完成不能自动将 `REAL_USER_CONTEXT_TO_EXTERNAL_MODEL` 改为 ALLOWED。

2026-09-09 最终收口：兼容补丁完整保留，Agent 251/251、Golden 25/25 与两协议 mock HTTP 回归通过，隔离 build PASS、mock Agent E2E 5/5。真实端点未重验，当前候选不能继承历史 MoMA PASS。详细源码指纹、数据库验证阻断与阶段状态见 implementation-status 最新章节。
