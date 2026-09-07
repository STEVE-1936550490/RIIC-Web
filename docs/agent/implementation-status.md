# Agent Implementation Status

## Current local engineering closeout — 2026-09-07

This records the **accepted worktree at engineering closeout, before subsequent commit/push authorization**, not a deployment or real-model acceptance. The table's operation statuses describe that closeout round; later publication is recorded by Git history and the target branch ref. M3 ends here; no M4 work is included. The user's complete M3 task supersedes the previous partial prompt and its missing-sections note.

| State | Current evidence |
| --- | --- |
| M3_ENGINEERING_CLOSEOUT | COMPLETE — local safe read-only PoC + M3.5B engineering delivery only |
| M3_5B_CODE_DELIVERY | COMPLETE |
| RESPONSES_OFFLINE_VALIDATION | PASS |
| CHAT_COMPLETIONS_OFFLINE_VALIDATION | PASS |
| API_INTEGRATION_VALIDATION | PASS |
| BUILD_VALIDATION | PASS — final-source isolated cloud-enabled webpack build and standalone preparation |
| BROWSER_ACCEPTANCE | PASS — 4 tests, 0 failures/skips, final isolated artifact |
| REAL_ENDPOINT_VALIDATION_THIS_ROUND | NOT_RUN_NOT_AUTHORIZED |
| HISTORICAL_ENDPOINT_ROOT_CAUSE | UNRESOLVED |
| MODEL_ENDPOINT_HTTP_REQUESTS_THIS_ROUND | 0 |
| REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PRIVACY |
| COMMIT / PUSH / DEPLOY | NOT_PERFORMED |

### Recovery and preserved work

- Start cwd `/root/riic-web-agent-lab`; Git root `/root/riic-web-agent-lab/RIIC-Web`; branch `diy/agent-m0-m3`. LOCAL_HEAD and read-only GitHub REMOTE_HEAD both `c89ffeeef9c27b5a0be6f46e03657a82a90b532a`. Recovery documents and related existing source/tests were read at this fixed remote SHA. The remote has the M3.5A baseline; local M3.5B includes modified and new source/tests/docs. The new `compatible-provider.md` is absent remotely (404), as expected. No pull, branch switch or upstream synchronization occurred. A remote SHA does not establish the running server's state; deployment/configuration was not inspected.
- Rules read directly: root `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`; no applicable parent/nested/override rule file. Necessary Agent contracts and installed Next.js guidance were read. No missing necessary references. The AGENTS Responses-only note is historical implementation state, superseded by source and this authorized task; its initialization-only restrictions do not cancel the later implementation authorization. Four read-only tools, server actor/domain authorization, budgets, egress and publication permissions remain binding.
- Root `AGENTS.md` was already ignored/untracked and remains unchanged, unstaged. SHA-256 before and after: `cf10d57585e9de9e0992695560962bb3682e7e0e11893d67f95ffdf4f016335f`. No user modifications were discarded. No `.env`, credentials, real sessions or business databases were read.
- Retained the existing M0/M2 contracts, one Loop/Registry/Policy, API handler, controlled right panel and in-memory runs. Retained the already-local M3.5B explicit dual-protocol configuration, SDK adapters, safe diagnostics and synthetic runner. No vendor/domain/model special cases, new dependencies or lockfile changes.

### Actual closeout fixes

- Both adapters bind initial input/tool definitions and single-run ordered history; Responses additionally verifies complete pending call identity/arguments before refill. Cancellation is checked after transport. No dropped required continuation, duplicated refill or hidden reasoning output.
- Diagnostics preserve safe HTTP status (including redirect/format rejection), stage, attempt count, fixed category and exact allowlisted upstream code/type; unknown fields become `UNKNOWN`. No upstream messages, bodies, endpoint, stack or tool payload enter diagnostics or public API DTOs.
- CLI `--mode basic|full` defaults to basic, with 1/12 actual-attempt limits respectively. Basic failure blocks later probes. After basic success, strict output and the two M3 scenarios remain independent unless authentication, rate, server/network, timeout/cancellation, redirect, configuration or budget failure makes further requests inappropriate. Per-capability counts include failures. Ordinary tests and old opt-ins cannot enable live acceptance.
- Panel also marks old/late answers stale after the question changes (including room/shift commands). Existing plan/layout/shift/observed/account revision and stop/close/unmount guards remain. Fake room output includes resolved room/shift; fake comparison exposes deterministic available natural-24h metrics.
- Synthetic checks also verify resolved room/shift, planned/observed separation and a zero-HTTP local Registry/M2 cross-user denial control. Added actual API handler → fake → M2 coverage of summary, room, same-title candidates, list-issued IDs and comparison; retained ownership/privacy/negative checks. Added browser fixtures for all three scenarios and close/question-change late responses.
- Added explicit-environment offline commands and an isolated current-source copy tool. Copies include relevant uncommitted/untracked public files and a SHA-256 manifest, exclude real configuration/data and keep dependency symlinks inside the copy. Builds use the cloud-enabled webpack profile; browsers use two newly selected loopback ports with existing-service reuse disabled.

### Validation provenance

Final required gates all exited 0 on the final source. `npm run test:agent`: **206 passed**, including **25 Golden cases**; separate `npm run test:agent:golden`: **25 passed**; installed `tsc --noEmit` (equivalent to `npx --no-install tsc --noEmit`): PASS; `npm run check`: PASS (hygiene, assets, i18n, lint, existing unit/service/API/shift regressions); `git diff --check`: PASS; `ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack`: PASS including prerender and standalone preparation; `npm run test:e2e:agent` equivalent isolated Playwright entry: **4 passed**, no failures/skips. Commands run through the explicit-environment wrapper described in the runbook; do not add Golden or repeated check runs to claim extra unique coverage. Browser acceptance uses mocks and proves UI behavior. API tests execute fake → actual M2. Both protocol tests execute mock HTTP → installed SDK/Loop → actual M2. None is a real-model end-to-end test or an arbitrary-natural-language intelligence evaluation.

The prior local M3.5B report's 200 Agent tests and unrun build/E2E are historical; this closeout adds and runs the missing coverage. Sandbox Node child-process restrictions required approved offline execution outside the sandbox. An initial copied dependency symlink incorrectly targeted the original Next install; preserving relative symlinks fixed isolated webpack prerender without changing product code. Synthetic storage was moved outside the repository to satisfy the existing private-storage guard. Earlier failed test-copy attempts are not recorded as PASS.

The final artifact is in `/tmp/riic-agent-closeout-WOH6Pu`. Its non-document public-source manifest matches the worktree (manifest SHA-256, sorted JSON with compact separators, excluding `docs/`: `c2f1cb5ea8cf430bf5b9bfd57819edd43d79fdcf1d895bc642348001e96600b4`). Final browser run took 10.2 seconds; its two loopback test services exited. Final evidence logs are retained locally under `/tmp/riic-m3-{tests,golden,tsc,check,build,e2e}.log`, outside Git. Documentation was finalized after these runs; final hygiene/diff/hash checks cover that documentation-only update.

No network dependency audit was run in this offline closeout. Historical Turbopack/environment and cloud-disabled webpack limitations below were not used to skip the required cloud-enabled webpack route. See [local demo, exact gate mapping, cleanup and future acceptance commands](m3-local-demo.md), [dual-protocol contract](compatible-provider.md), [Responses history](responses-compatible-provider.md) and [M3 architecture](m3-read-only-agent-architecture.md).

COMPLETE means **M3 safe read-only PoC + M3.5B local engineering delivery** only. Real endpoint acceptance remains separately authorized work; business-data release requires separate privacy approval. No production-readiness or supplier-wide compatibility claim is made.

## Historical M3.5A baseline and evidence

- Branch: `diy/agent-m0-m3`
- Base: `3c342e8c812aebf9c5a62db05812efc798bdac57` (`upstream/develop`, fixed target fetched at M3.5A start).
- Upstream sync date: 2026-09-07 (Asia/Shanghai); merge `f25851e` preserves published history, with no conflicts. Upstream only removes a training-ready card and adjusts its test; Agent boundaries unchanged. No new dependencies; lockfile unchanged in M3.5A.
- M0: approved; M0_REVALIDATION: PASS (three read-only use cases unchanged).
- M1.1: completed; revalidation PASS (intent contract unchanged).
- M1.2 code: completed; revalidation PASS (OpenAI SDK retained; smoke opt-in).
- M2.1: completed — `current_plan.get_summary`; allowlist excludes debug, fallback metadata, and upstream drone additions.
- M2.2: completed — `current_plan.get_room_detail` (`5b0c4ab`); deterministic resolution, zero-based shifts, planned/observed separation, compatible context schema 1.
- M2.3: completed — `saved_plan.list` (`17e83ec`); injected actor, consent/ownership/retention-scoped reads, minimal metadata.
- M2.4: completed — `saved_plan.compare` (`8ab3a0e`); both IDs authorized before payload reads, bounded deterministic diffs and explicit not-comparable reasons.
- M2 status: COMPLETE — four read-only tools; no Tool-level DB access, writes, or solver/model calls.
- Shared domain reads avoid the ordinary API's existing prune/decryption/key-rotation maintenance. Tests use synthetic repositories and SQL generation, never real user database contents.
- Comparison uses reported natural 24-hour production only (excludes drones and estimates); missing metrics are not filled, `durationMs` is not quality, personnel sets ignore skill-selection suffixes.
- M3 status: SAFE_READ_ONLY_POC_COMPLETE — not production-ready; see [architecture and demo limits](m3-read-only-agent-architecture.md).
- M3.5A CODE_DELIVERY: COMPLETE — explicit Responses-compatible endpoint/model/key, shared SDK transport, runtime protocol validation, private continuation and synthetic acceptance command. [Setup and capability limits](responses-compatible-provider.md).
- CONFIGURATION_STATUS: TEMPORARILY_PROVIDED_FOR_ACCEPTANCE — user supplied configuration for the manual attempts below; persistent deployment configuration is not verified.
- REAL_RESPONSES_ENDPOINT_VALIDATION: CAPABILITY_INCOMPATIBLE; ROOT_CAUSE: UNRESOLVED. Basic Responses access has not succeeded; later capabilities cannot be evaluated independently.
- Registry / Policy: complete; exactly the four M2 tools, server-issued session actor, visibility and execute-time checks, unchanged domain authorization.
- Agent Loop: complete; provider-neutral calls/final answers, hard step/call/time/token/result limits, repeated-call detection, cancellation, code-generated sources and safe ephemeral traces.
- Model egress: external + user_business_context always blocked. User-reported synthetic endpoint attempts are recorded below; M1 classifier remains independent and unchanged.
- Agent API: complete (`GET/POST /api/agent`); server feature flag defaults off, strict request/context validation, session/origin/body/rate boundaries. Fake mode requires server development/test configuration.
- Agent Panel: complete; right-side Workbench panel, explicit FAKE/TEST mode, Stop/retry/status/source display and stale-context protection. No Agent persistence or business writes.
- Validation provenance: the test/build/audit results below are prior M3.5A delivery records, not new closeout runs. The historical documentation-only closeout reran hygiene/diff checks only; current engineering validation is recorded above.
- Agent + saved-plan service tests: PASS (186 tests, 0 failures/skips), including M1/M2 regressions, runtime, egress, API, SDK/HTTP adapter, synthetic acceptance runner and Golden Set.
- Golden Set: PASS (25 synthetic cases covering all three M0 scenarios and negative boundaries).
- API tests: PASS (4 grouped M3 cases; 76 existing API contract tests also pass in check).
- Agent E2E: PASS (2 scenarios, 0 skips); enabled panel interactions and disabled-production flag. Synthetic fixtures/mocks only; full fake-provider-to-real-M2 execution is separately tested at the API boundary.
- TypeScript: PASS (`npx --no-install tsc --noEmit`).
- lint: PASS (`npm run lint`, also rerun by check).
- `npm run check`: PASS in M3.5A, including Agent and existing API/shift contract tests; no model network requests in ordinary tests/check.
- SECURITY_AUDIT: PASS (`npm run audit:security`; 0 vulnerabilities).
- WEBPACK_BUILD: PASS (`ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack`; current E2E profile, prerender and standalone preparation included).
- Browser acceptance uses the existing cloud-enabled test profile. The cloud-disabled webpack bridge can still fail at request time with `setActiveShift` on null; no unrelated business-source workaround was introduced.
- DEFAULT_TURBOPACK_BUILD: BLOCKED_ENVIRONMENT_EPERM (CSS worker process/port binding on `globals.css`, actually reproduced in M3.5A outside the sandbox; no business-code workaround).
- `git diff --check`: PASS. No new dependencies, real fixtures, secrets, logs or screenshots in M3 commits.
- Historical REAL_OPENAI_SMOKE: PENDING_NO_API_KEY (not run); superseded as this stage's acceptance target, not a requirement for an official OpenAI account/key. Old smoke command only prints migration guidance.
- REAL_USER_CONTEXT_TO_EXTERNAL_MODEL: BLOCKED_PRIVACY.
  - Privacy version `2026-09-06-processing-clarification` does not specify external model providers, transmitted model context, retention/training boundaries, or corresponding model consent. This does not block deterministic tools or local fake/synthetic PoC validation.

## Historical M3.5A endpoint closeout — 2026-09-07

- M0–M3 safe PoC and M3.5A code delivery retain their existing states; CODE_DELIVERY: COMPLETE. Code checkpoint tested in the user-reported attempts: `8461605e70cf19e56eddccc49da459b858db042b`.
- Evidence provenance: the user manually ran both acceptance attempts on the server and supplied their summaries. The assistant did not execute these attempts; this closeout only archives the summaries, with no raw terminal logs or private endpoint paths.
- Attempt 1 — endpointId `980cb56ffd1b`: a complete Chat Completions interface address was incorrectly used as Base URL. The then-current transport appended `/responses`, producing the wrong path. Script count: 4 HTTP attempts; status: CAPABILITY_INCOMPATIBLE. This attempt cannot establish the supplier's Responses support.
- Attempt 2 — after the user corrected the API root per the earlier instructions: endpointId `3069b2c951c6`; protocol `responses`; requestedModel `ZHIPU/GLM-5.3`; reportedModels `[]`; requests `4`; responsesBasic / strictStructuredOutput / current / saved / functionToolLoop all `FAIL`; usage `unavailable`; status `CAPABILITY_INCOMPATIBLE`.
- Combined script count: 8 model HTTP request attempts, not 8 successful inference calls. Cost cannot be determined from these summaries; no zero-cost claim is made. Temporary environment variables do not establish persistent deployment readiness.
- Conclusion: the tested endpoint, supplied model identifier and request shapes did not pass Responses acceptance. REAL_RESPONSES_ENDPOINT_VALIDATION: CAPABILITY_INCOMPATIBLE; ROOT_CAUSE: UNRESOLVED. The then-current mapping combined HTTP 400/404/405/422, and the supplied summaries omit the actual HTTP status and upstream error code. Basic access is not working, so later structured-output/tool-loop capability cannot be independently judged. This does not establish that MoMA lacks Responses, that GLM lacks Tool Calling, that the key/model ID is valid, or that Agent business tools failed.
- REAL_USER_CONTEXT_TO_EXTERNAL_MODEL remains BLOCKED_PRIVACY. No source/configuration changes, new adapter, protocol fallback, further model request or M4 work occurred in this closeout.
- Deferred diagnostic notes at that checkpoint (subsequently implemented in local M3.5B): consider rejecting complete `/chat/completions` addresses as Responses API roots; retain necessary HTTP status and safe error classification without request/response bodies or credentials so distinct failures remain diagnosable.
- Historical NEXT (superseded by the current authorized M3.5B engineering delivery): 核对 MoMA 对指定模型实际提供的接口协议和参数契约，明确当前失败属于路由、参数、模型配置还是其他问题；依据证据再决定是否另行授权 Chat Completions adapter。
