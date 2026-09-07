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
| Continuation | Existing run-scoped message/function/encrypted-reasoning support | Run-scoped assistant/tool messages; unsupported reasoning extensions fail closed |

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

All three commands accept only `--mode basic` or `--mode full` (after npm’s `--`); default mode is **basic**. Invalid arguments fail before HTTP. Each command defaults to zero requests without complete configuration and its own opt-in. They are not part of ordinary tests or `npm run check`. A legacy or other protocol's opt-in cannot activate them. Commands accept only built-in synthetic fixtures, a synthetic actor and in-memory repositories; no website session, real database, Workspace, Box, page snapshot or Skland data is loaded. Use deployment secret injection or hidden shell input for the key, never chat, command arguments, Git or documentation.

Basic mode permits **1 HTTP attempt** and checks only `basicCompletion`; other capabilities are `BLOCKED` with zero attempts. Full mode permits **12 HTTP attempts total**, including failures, and reports these capabilities separately:

1. `basicCompletion`: exact synthetic reply. Failure blocks all dependent probes (`BLOCKED`, not independent failures).
2. `jsonOutput`: JSON mode and local exact synthetic-object validation.
3. `strictStructuredOutput`: existing M1 intent schema and semantic parser. JSON and strict probes are independent; neither failure changes parameters for the other probes.
4. `current`: automatic summary + room calls, valid arguments and call IDs, actual M2 execution, result refill, resolved active shift, planned operators, explicitly unavailable observed data, final facts and code-generated source verification.
5. `saved`: automatic list → compare → answer across multiple rounds; IDs must come from the authorized list; foreign-owner data stays absent. Checks deterministic 100/150/50 values and both sources. A local negative control also invokes the actual Registry/M2 to reject a foreign-owner comparison; it is not fabricated into model observations and adds no HTTP attempt.

After basic success, JSON/strict/current/saved are independent assessments: an M1 strict failure alone does not prove M3 tools unsupported. Authentication/permission, rate limit, server/network, timeout/cancellation, redirect, configuration or budget failure stops subsequent attempts; unexecuted capabilities are `BLOCKED`, never independent FAIL/UNSUPPORTED. Full overall PASS requires every required capability; basic PASS says nothing about strict/tools.

`functionToolLoop` passes only when both business scenarios pass. Nonempty prose or HTTP 200 cannot substitute for Tool execution, correct facts or sources. Offline SDK tests exercise abort, timeout, malformed/refused/truncated output, duplicate/missing IDs, history isolation, errors, request budgets and egress independently; the live runner does not fabricate those failures by making additional model requests. Multiple tool calls are accepted but not forced, so synthetic PASS is not a forced-parallel-tools claim.

Summaries contain endpoint hash, protocol, requested/reported model, request-shape version (`m3.5b-strict-tools-v1`), mode/request limit, total and per-capability attempt counts, stage, capability outcomes, safe diagnostics and usage availability. Record the code SHA and any uncommitted patch separately with acceptance evidence. Reported model is an unverified endpoint assertion. Narrow fact checks are not a general semantic evaluator; one valid strict result cannot prove universal server-side strict enforcement.

## Delivery and privacy

This delivery runs **offline validation only**. M3.5B `REAL_ENDPOINT_VALIDATION=NOT_RUN` (not authorized); no MoMA, GLM or other endpoint capability claim is added. Historical M3.5A Responses failure evidence remains in [implementation status](implementation-status.md).

`REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY` remains unchanged. Configuration and synthetic success do not authorize real business egress, including to a private gateway. Normal `/api/agent` traffic remains business context and is blocked before constructing an external provider; clients cannot select protocol, endpoint, actor or synthetic classification. `store=false` is a protocol option, not a third-party retention/training guarantee. M0 stays read-only; no M4, writes, solver, RAG, persistence or product multi-agent behavior is introduced.

For isolated offline validation, the three-layer evidence and separately authorized basic/full command examples, see [the local demo and acceptance runbook](m3-local-demo.md).
