# Responses adapter and M3.5A acceptance history

M3.5B adds the sibling Chat Completions adapter and shared configuration, transport diagnostics and capability runner. See [the current dual-protocol contract](compatible-provider.md). The Responses-specific continuation contract below is retained; the dated closeout records historical evidence, not this round's tests.

Protocol, endpoint, model and SDK are separate choices. This adapter speaks **Responses only**, to the API root explicitly selected by the operator, using the installed `openai` npm SDK. The SDK does not identify the supplier. No official OpenAI account/key is required, no model is selected by default, and there is no official-service or Chat Completions fallback.

## Server configuration

The sole configuration source is the following server environment. Scripts do not load `.env` files or any login/credential files. Historical `OPENAI_*` and `AGENT_OPENAI_MODEL` values are not used; inherited SDK headers are replaced at the send boundary.

| Variable | Required / meaning |
| --- | --- |
| `AGENT_MODEL_PROTOCOL` | Required, exactly `responses` for this adapter; the shared factory also accepts `chat_completions` |
| `AGENT_MODEL_BASE_URL` | Required API root, HTTPS by default |
| `AGENT_MODEL_API_KEY` | Required key issued for that endpoint |
| `AGENT_MODEL_ID` | Required exact model ID from the endpoint operator |
| `AGENT_MODEL_REASONING_CONTINUATION` | `none` (default) or explicitly `encrypted` |
| `AGENT_MODEL_ALLOW_LOOPBACK_HTTP` | Only `1` together with `APP_DEPLOYMENT_ENV=development` allows HTTP at exact `localhost`, `127.0.0.1` or `[::1]` |
| `RUN_RESPONSES_AGENT_SMOKE` | Only `1` opts into paid/network synthetic acceptance |

The API root includes `/v1` **only if your endpoint documents that prefix**. `https://gateway.example.invalid/v1` sends to `/v1/responses`; `/custom/api` sends to `/custom/api/responses`. A trailing slash is normalized. A complete `/responses` or `/chat/completions` URL, userinfo, query, fragment, ambiguous/encoded paths, non-loopback HTTP and official model hosts are rejected. No alternate addresses are probed. Redirects are rejected; TLS verification is not disabled. SDK retries are zero, timeout <=15 seconds/request, with the existing 20-second/5-step/6-tool run limits unchanged.

Use deployment secret injection in hosted environments. For an interactive Bash acceptance run, replace only the non-secret endpoint/model placeholders and enter the key at the hidden prompt:

```bash
export AGENT_MODEL_PROTOCOL=responses
export AGENT_MODEL_BASE_URL='https://gateway.example.invalid/v1'
export AGENT_MODEL_ID='your-explicit-model-id'
read -r -s -p 'Endpoint API key: ' AGENT_MODEL_API_KEY
export AGENT_MODEL_API_KEY
RUN_RESPONSES_AGENT_SMOKE=1 npm run smoke:agent:responses -- --mode basic
unset AGENT_MODEL_API_KEY
```

Do not paste keys into chat, shell command arguments, documentation or Git. The example host is deliberately nonfunctional. Without all required variables or without opt-in, the command makes zero requests. `smoke:agent:openai` now only prints migration instructions; the old opt-in cannot initiate a request. Programmatic callers should use `createResponsesModelProvider` / `createResponsesLoopProvider` with `readResponsesConfig`; historical factory names accept only the new configuration, not the former positional key/model shortcut.

## Capability acceptance

`npm run smoke:agent:responses` uses only built-in synthetic fixtures, a synthetic actor and in-memory repositories; it executes the real M2 tools and ownership checks. It does not read website sessions, a production database, page context, Workspace or Skland data.

The default / `-- --mode basic` invocation permits **1 HTTP attempt** and leaves the remaining capabilities BLOCKED. A separately authorized `-- --mode full` invocation has a shared maximum of **12 HTTP requests**, including errors. There is no automatic rerun to obtain PASS. It checks:

1. Responses basic completion (`POST /responses`, model/input, `store=false`, status/output).
2. JSON mode with exact synthetic-object validation, separately from strict Structured Outputs using the existing M1 intent schema plus local shape/semantic validation.
3. Automatic tool selection: summary + room detail, then final facts and actual code-generated sources.
4. Automatic list → compare: the model must see the authorized list before choosing its returned IDs; deterministic LMD values/delta and sources are checked.

These are automatic-selection behavior checks, not forced `tool_choice` claims. Fact checks are deliberately narrow, not a general semantic evaluator. HTTP 200 or nonempty prose alone cannot pass. Request counts, tools/statuses, capability outcomes, safe usage and requested/reported model IDs are printed; endpoint is represented by a hash. Missing usage is `unavailable`, not zero. Reported model is an unverified endpoint assertion. No raw request/response, headers, key or reasoning is printed/saved.

Basic completion, JSON mode, strict schema and multi-round function calling are separately assessed. Basic failure blocks dependent probes after one attempt. The current summary uses `basicCompletion` and `jsonOutput` capability keys; the old `responsesBasic` key appears only in historical evidence. Errors distinguish authentication, route/capability incompatibility, rate limit, server/network failure, timeout/abort, incomplete, failed, refusal, malformed output, redirect and budget exhaustion. Current diagnostics separate 404/405 route incompatibility, recognized model configuration errors and 400/422 request-shape incompatibility; safe HTTP status, stage, attempt counts and allowlisted upstream code/type are retained without bodies or causes. These do not prove supplier-wide limitations. Chat Completions endpoints require explicit `chat_completions` selection through the sibling adapter and are never silently used instead.

Both adapters’ SDK/HTTP offline tests are rerun in the current engineering closeout; see the current status table. The earlier documentation-only closeout did not rerun those tests. **Historical M3.5A real endpoint acceptance is CAPABILITY_INCOMPATIBLE; ROOT_CAUSE is UNRESOLVED. M3.5B real endpoint validation is NOT_RUN (not authorized).** The user temporarily supplied configuration and manually ran two attempts against code checkpoint `8461605e70cf19e56eddccc49da459b858db042b`; these failures are not NOT_RUN_MISSING_CONFIG. Persistent deployment configuration is unverified. Future PASS applies only to the tested endpoint configuration, model and request shapes at that time; one valid JSON result cannot prove universal server-side strict enforcement.

### Closeout — 2026-09-07

The user supplied both manual-run summaries; the assistant did not execute them. Attempt 1 (`980cb56ffd1b`, 4 HTTP attempts) used a complete Chat Completions URL as Base URL, so the transport appended `/responses` to the wrong path; its CAPABILITY_INCOMPATIBLE result cannot judge supplier Responses support. Attempt 2 (`3069b2c951c6`, 4 attempts) followed correction of the API root and requested `ZHIPU/GLM-5.3` using `responses`: reportedModels was empty, usage unavailable, and responsesBasic / strictStructuredOutput / current / saved / functionToolLoop all reported FAIL, with overall CAPABILITY_INCOMPATIBLE.

The total is 8 HTTP request attempts, not 8 successful inferences; cost is unknown. The actual HTTP status/upstream code is absent from the summaries, while the then-current error mapping grouped 400/404/405/422. Basic Responses access has not succeeded, so neither later capabilities nor key/model validity can be established, and this is not proof of a supplier-wide limitation or failed Agent business tools.

Deferred at the historical closeout (implemented locally in M3.5B): reject complete `/chat/completions` API addresses in configuration validation; preserve necessary HTTP status and safe error categories without exposing bodies or credentials. That historical closeout made no model requests, protocol switch, new adapter or M4 changes. Current scope and evidence are in [implementation status](implementation-status.md).

## Continuation and privacy

`reasoning.encrypted_content` is not requested by default. Enable `AGENT_MODEL_REASONING_CONTINUATION=encrypted` only when the endpoint/model documentation explicitly supports opaque encrypted continuation under `store=false`. The adapter supports message/function items and opaque encrypted reasoning items with empty summary; other necessary reasoning state fails with `AGENT_RESPONSES_CONTINUATION_UNSUPPORTED`. It never drops unsupported necessary state to pretend success or repeatedly removes parameters until a request works.

History is ordered, private and run-scoped; function results use `call_id`, not response item `id`, and are inserted once. No `previous_response_id` dependency, cross-run history pool, hidden-reasoning display or persistence exists. Strict schemas, budgets, authorization and egress cannot be downgraded.

`store=false` is a request option, **not a third-party zero-retention/training promise**. All compatible providers remain `external`. M1 checks egress before sending (missing classification means business data); M3 checks every round. Normal `/api/agent` requests remain `user_business_context`, even with a configured private gateway/key. They cannot opt into synthetic data or choose endpoint/provider and remain blocked by `AGENT_MODEL_EGRESS_BLOCKED` outside approved local fake mode.

`REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY` remains unchanged. Historical `REAL_OPENAI_SMOKE=PENDING_NO_API_KEY` is not this stage's acceptance target or a requirement for an official key. This stage tracks `REAL_RESPONSES_ENDPOINT_VALIDATION`.

To disable UI/API, unset `AGENT_FEATURE_ENABLED` (default off). To use local deterministic demo, configure `AGENT_FEATURE_ENABLED=1`, `APP_DEPLOYMENT_ENV=development`, `AGENT_MODEL_MODE=fake`; this does not enable external-model business egress. Production fake execution remains rejected.

Protocol references: [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). These describe the protocol mapping, not an unprovided gateway's capabilities or data policy.

Use the [isolated demo and acceptance runbook](m3-local-demo.md) for local execution and separate basic/full authorization. This round runs no real endpoint command.
