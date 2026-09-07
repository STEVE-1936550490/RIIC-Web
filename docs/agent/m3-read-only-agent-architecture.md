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

M3.5A unifies M1/M3 behind an explicitly configured Responses-compatible endpoint. The installed openai SDK is transport infrastructure, not supplier identity. No official endpoint/model or legacy credential defaults are used. The adapter implements strict schemas, canonical-name aliases, call_id/output matching and private run-scoped continuation. Encrypted reasoning is an explicit optional capability, disabled by default; unsupported necessary continuation fails closed. `store=false` does not promise third-party zero retention. See [configuration, synthetic acceptance and limitations](responses-compatible-provider.md).

## Workbench and verification

The existing right-side Sheet hosts the advisor. Plan, layout, active shift, observed snapshot or account changes advance the page revision. Each request captures its revision; mismatched returned/current revisions display STALE_CONTEXT and hide the old answer. Stop/close/unmount abort fetch and ignore late responses. Nothing is stored in localStorage or a database by the panel.

`npm run test:agent` runs Agent contracts, runtime, API and offline provider tests. `npm run test:agent:golden` runs 25 synthetic cases. The Golden Set checks routing/arguments, allowed/forbidden tools, facts, ambiguity, authorization, failures, repeat protection and stale revision; it is not an evaluation of an actual LLM's intelligence.

Browser tests use existing synthetic Workbench fixtures and mocked Agent responses; API tests separately execute the full fake-provider → real M2 implementation chain. No real database or account is used. For the browser artifact, use the repository's existing cloud-enabled test profile:

```sh
ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack
npm run test:e2e:agent
```

The dedicated suite starts enabled-development and disabled-production standalone servers on loopback, with screenshots/traces disabled. Default webpack builds compile, but the existing webpack cloud-disabled alias/runtime mismatch can fail at request time (`setActiveShift` on null); this PoC does not change that unrelated bridge. Default Turbopack remains subject to the environment's CSS worker port-binding EPERM.

The historical REAL_OPENAI_SMOKE remains PENDING_NO_API_KEY, but is no longer the active acceptance target or a requirement for an official key. REAL_RESPONSES_ENDPOINT_VALIDATION is NOT_RUN_MISSING_CONFIG; the new command defaults offline. REAL_USER_CONTEXT_TO_EXTERNAL_MODEL remains BLOCKED_PRIVACY. Next: configure and accept the chosen endpoint using synthetic fixtures, then separately review privacy; no M4, writes, solver, RAG, memory or multi-agent work.
