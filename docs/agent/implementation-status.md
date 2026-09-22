# Agent Implementation Status

## M5 Phase A — final local engineering closeout, 2026-09-22

The user-side reviewer confirmed all M5 engineering completion criteria and
authorized this final local documentation checkpoint. This section supersedes
the candidate statuses below, which remain historical evidence. Only the two
M5 documents changed; implementation, tests, UI and pinned assets are unchanged.

| Final current state | Result |
| --- | --- |
| Branch | `diy/agent-m0-m3` |
| DIY_LOCAL_HEAD / DIY_REMOTE_HEAD | `07390a1462b91e1b007410b4f669f9b8bbd9b499` / same; fresh read |
| UPSTREAM_MAIN_HEAD | `95ed0c699b50befbef90d83314bccbd6915e26bd`; fresh read |
| UPSTREAM_DRIFT_M5_IMPACT | NONE; eight new Live Activity UI/test/dependency paths since the previous audit; no M5 data/auth/Agent change; nothing synced |
| M5_STATUS | COMPLETE |
| M5_ENGINEERING_CLOSEOUT | COMPLETE |
| M4_STATUS / M6_STATUS / M7_STATUS | COMPLETE / NOT_STARTED / NOT_STARTED |
| WORKTREE_CANDIDATE_PRESERVED | YES; 22 files; 0 staged, 16 modified, 6 untracked |
| RECOVERY_HASH_MATCH / RUNTIME_TEST_UI_HASH_UNCHANGED | 22/22 / YES |
| FINAL_REVIEW / HIGH_OPEN / MEDIUM_OPEN / LOW_OPEN | Accepted PASS / 0 / 0 / 0; no new implementation review or fixes |
| STRUCTURED_GAME_DATA_SOURCE | CURRENT_DIY_BUILD_PINNED_CATALOG |
| STRUCTURED_GAME_DATA_VERSION | `593aa9d5b9b87c27eea762994a376f579a6e9038` |
| SKILL_ANNOTATION | PUBLIC_EXISTING_RECORDS / READ_ONLY |
| TRAINING_ADVICE_KNOWLEDGE | BLOCKED_PRIVATE_ARTIFACT |
| RELEASE_NOTES | AUDITED_AVAILABLE / NOT_IN_M5_V1 |
| EXTERNAL_BUSINESS_KNOWLEDGE_TOOL | UNAVAILABLE |
| REAL_BUSINESS_EGRESS_RELEASE / REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY / BLOCKED_PROVIDER_POLICY |
| TARGETED_TESTS / AGENT / GOLDEN / API_CONTRACT | Verified previous-stage PASS 42/42 / 356/356 / 42/42 / 76/76; NOT rerun this closeout |
| TSC / CHECK | Verified previous-stage PASS / PASS; NOT rerun this closeout |
| DIFF_CHECK | Fresh PASS after final documentation update |
| BUILD / STANDALONE / E2E | VERIFIED_EXISTING_CANDIDATE_EVIDENCE / same / same, E2E 7/7; NOT rerun |
| REAL_POSTGRES_VALIDATION / PRODUCTION_ANNOTATION_VALIDATION / REAL_MODEL_VALIDATION | NOT_RUN / NOT_RUN / NOT_RUN |
| MODEL_HTTP_REQUESTS_THIS_ROUND / DB_BUSINESS_WRITES / SOLVER_INVOCATIONS | 0 / 0 / 0 |
| COMMIT / PUSH / DEPLOY | NOT_PERFORMED / NOT_PERFORMED / NOT_PERFORMED |

All criteria are satisfied: deterministic skill lookup; annotation available,
absent and unavailable handling; missing/ambiguous fail closed; zero admin/DB
private-field leakage; fake/offline automatic tool selection and observation
refill; grounded final answer; server-authored provenance; separate manual
annotation attribution; blocked external business visibility; zero business writes
and solver calls; passing M0/M4 regression. No vector RAG is needed for this use case.

The completed chain is existing structured building-skill data + public manual
annotation → deterministic Knowledge service → `knowledge.get_skill_context` →
existing Agent Tool Loop → server-authored provenance → grounded answer. COMPLETE
does not claim current/latest game assets, Hypergryph-official annotation, private
training advice or release-note integration, generic document RAG, business egress
approval, production annotation acceptance or real-model M5 acceptance. Existing
read-only policy and budgets remain unchanged. See the [M5 design and retained
limitations](m5-authoritative-knowledge.md).

Final evidence: `/tmp/riic-m5-final-closeout-20260922/`; previous acceptance:
`/tmp/riic-m5-revalidation-20260918/final-evidence.json`. Both previous evidence
hash manifests and all 1,875 source entries in `/tmp/riic-agent-closeout-CS8r1q`
verify. Runtime/test/UI/configuration are identical to that build; only the two
evidence documents differ. The final candidate SHA-256 manifest includes all
22 files. Evidence is outside Git. Stop here; await separate explicit authorization
for the final Commit/Push checkpoint.

## M5 Phase A — repeat final-review revalidation (historical), 2026-09-18

This was the latest candidate execution record before final closeout. The preceding final review below is retained
as historical evidence, including its three fixes; none is claimed as a new fix.
This round only updates these two M5 evidence documents. No new review findings
or runtime/test/UI changes were necessary.

| Latest state | Result |
| --- | --- |
| Branch | `diy/agent-m0-m3` |
| DIY_REMOTE_HEAD / DIY_LOCAL_HEAD | `07390a1462b91e1b007410b4f669f9b8bbd9b499` / same; fresh lookup |
| UPSTREAM_MAIN_HEAD | `9ab547fdfff60ec5031b557e24fd9b98e515a119`; fresh lookup |
| WORKTREE_CANDIDATE_PRESERVED / RECOVERY_HASH_MATCH | YES; 0 staged, 16 modified, 6 untracked; canonical hash file exists, 22/22 match |
| UPSTREAM_DRIFT_M5_IMPACT | NONE; original-to-fresh 13-path password-policy delta re-read; no Session/Actor or knowledge semantic change |
| M4_STATUS / M6_STATUS | COMPLETE / NOT_STARTED |
| M5_STATUS | IN_PROGRESS / CLOSEOUT_READY_CANDIDATE |
| M5_CLOSEOUT_READY | YES; formal closeout remains the user's decision |
| FINAL_REVIEW / HIGH_OPEN / MEDIUM_OPEN / LOW_OPEN | PASS; no new findings / 0 / 0 / 0 |
| TARGETED_TESTS / AGENT / GOLDEN / API_CONTRACT | Fresh PASS 42/42 / 356/356 / 42/42 / 76/76 |
| TSC / CHECK / DIFF_CHECK | Fresh PASS / PASS / PASS |
| BUILD / STANDALONE / E2E | VERIFIED_EXISTING_CANDIDATE_EVIDENCE for all three; NOT rerun this round |
| MODEL_HTTP_REQUESTS_THIS_ROUND / DB_BUSINESS_WRITES / SOLVER_INVOCATIONS | 0 / 0 / 0 |
| REAL_POSTGRES / PRODUCTION_ANNOTATION / REAL_MODEL_VALIDATION | NOT_RUN / NOT_RUN / NOT_RUN |
| REAL_BUSINESS_EGRESS_RELEASE / REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY / BLOCKED_PROVIDER_POLICY |
| COMMIT / PUSH / DEPLOY | NOT_PERFORMED / NOT_PERFORMED / NOT_PERFORMED |

Evidence: `/tmp/riic-m5-revalidation-20260918/`. The preceding review's 22 hashed
evidence files verify; all 1,875 entries in the isolated copy's source manifest
verify. Current runtime/test/UI/configuration match that manifest, with only these
two Agent evidence documents differing. The preserved build log confirms webpack
and standalone preparation; browser log confirms 7/7. This meets the user-approved
reuse conditions; no historical Build/E2E PASS is described as a new execution.

Code revalidation confirms architecture B: exact pair-bound SELECT of note/update
time, all-existing-rows-public semantics, no draft/private field or second
visibility policy. Actor checks, bounded exact DTO, server-authored sources,
missing/ambiguous failure, absent/unavailable separation, M0/M4 routing and fixed
budgets remain intact. Catalog provenance remains **current DIY build pinned
structured game data**, commit `593aa9d5b9b87c27eea762994a376f579a6e9038`;
M5 does not auto-sync upstream assets. Knowledge schemas/observations remain
unavailable to external business providers despite consent. Training knowledge
remains BLOCKED_PRIVATE_ARTIFACT; release notes AUDITED_AVAILABLE / NOT_IN_M5_V1.
No real PostgreSQL, production annotation, private artifact or real model was
accessed. No Workspace/saved-plan/annotation writes, Skland refresh, solver,
arbitrary external HTTP or product shell Tool occurred. Stop for user review.

## M5 Phase A — preceding final candidate review (historical), 2026-09-18

This review supersedes the initial M5 candidate snapshot below. It preserves the
uncommitted candidate and does not authorize publication or a milestone closeout.

| Current review state | Result |
| --- | --- |
| DIY_REMOTE_HEAD / DIY_LOCAL_HEAD | `07390a1462b91e1b007410b4f669f9b8bbd9b499` / same, fresh remote lookup |
| UPSTREAM_MAIN_HEAD | `9ab547fdfff60ec5031b557e24fd9b98e515a119`, fresh read-only revalidation |
| WORKTREE_CANDIDATE_PRESERVED | YES — recovery: 0 staged, 15 modified, 6 untracked; original 21/21 hashes matched and were backed up |
| UPSTREAM_DRIFT_M5_IMPACT | NONE — 13 password-policy/UI/translation/test paths; no Session/Actor, annotation, catalog, runtime knowledge or Agent semantic change |
| M4_STATUS / M6_STATUS | COMPLETE / NOT_STARTED |
| M5_STATUS | IN_PROGRESS / CLOSEOUT_READY_CANDIDATE |
| M5_CLOSEOUT_READY | YES — offline engineering criteria met; formal closeout remains the user's decision |
| FINAL_REVIEW / HIGH_OPEN / MEDIUM_OPEN / LOW_OPEN | Code review complete: three MEDIUM fixed with regressions; 0 / 0 / 0 open |
| TARGETED_TESTS | Fresh PASS 42/42; public annotation API regression fresh PASS 2/2 |
| AGENT / GOLDEN / API_CONTRACT | Fresh PASS 356/356 / 42/42 / 76/76 |
| TSC / CHECK | Fresh PASS / PASS |
| DIFF_CHECK | Fresh PASS, including final evidence-only documentation |
| BUILD / STANDALONE / E2E | Fresh PASS / PASS / 7/7, no skips; isolated webpack build, no historical substitution |
| REAL_BUSINESS_EGRESS_RELEASE / REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY / BLOCKED_PROVIDER_POLICY |
| EXTERNAL_BUSINESS_TOOL_VISIBILITY | UNAVAILABLE — no Knowledge schema or observation in external business payload |
| TRAINING_ADVICE_KNOWLEDGE | BLOCKED_PRIVATE_ARTIFACT — fresh upstream still proves only required filename/private runtime dependency |
| RELEASE_NOTES | AUDITED_AVAILABLE / NOT_IN_M5_V1 |
| DB_BUSINESS_WRITES / SOLVER_INVOCATIONS / MODEL_HTTP_REQUESTS_THIS_ROUND | 0 / 0 / 0 |
| REAL_POSTGRES / PRODUCTION_ANNOTATION / REAL_MODEL_VALIDATION | NOT_RUN / NOT_RUN / NOT_RUN |
| COMMIT / PUSH / DEPLOY | NOT_PERFORMED / NOT_PERFORMED / NOT_PERFORMED |

Fresh review findings (all reproduced before fixing):

- MEDIUM: request projection accepted an unclassified observation with null
  result. Check membership in the existing four-tool classification map before
  projecting every observation, including null. No whitelist expansion.
- MEDIUM: a multi-call single-skill answer could retain earlier skill/revision
  sources. Final sources now match only the validated observation used by the
  deterministic answer.
- MEDIUM: offline knowledge grammar could intercept an explicit saved-plan list
  whose title resembled a knowledge question. Explicit M0/M4 commands keep their
  arguments; bilingual regression tests verify existing tool selection.

Annotation read architecture remains **B, exact parameter-bound SELECT** of
note/updatedAt for operatorId + skillId, LIMIT 1. Both it and the existing public
GET use the existing all-rows-public semantics; there is no additional publishing
or ownership rule. The schema has no draft/private/published state. Tests require
re-audit on schema changes, check public GET requires no admin identity, and
exclude DB row id, createdAt, creator/editor and future fields from observation
refill, final output and sources. Public global notes are readable by different
issued actors; this is existing public access, not cross-user private disclosure.

Structured facts are **current DIY build pinned structured game data** from
arkntools commit `593aa9d5b9b87c27eea762994a376f579a6e9038`. Fresh upstream still
pins `302105b1404bd488c4700d063da9dcf3661a94f0`. M5 does not auto-sync upstream
or game assets and does not claim latest/official data. Sources expose the actual
installed commit and deterministic projected-content revision. Project manual
annotation remains separately labeled, with no precedence or official attribution.
Missing/ambiguous/failed tools cannot become grounded success; absent and read
unavailable are distinct. The latter can accompany separately confirmed catalog
facts but never a confirmed note. Final source metadata is server-authored.

M4 budgets and its only Agent Loop remain unchanged: HTTP 15000 ms, run 60000 ms,
tool 5000 ms, five model steps, six calls, 12000 reported tokens, zero retries.
Fake/offline knowledge is available; external capability stripping and M3.6
classification rejection remain effective even with simulated Provider approval
and consent. Historical GLM tool-calling PASS grants no new egress permission.
Workspace, saved-plan and annotation business writes, production DB mutations,
solver, Skland refresh, arbitrary external HTTP and shell tools were not performed.
Existing Agent audit/cache bookkeeping is not a business mutation.

Evidence for this review is under `/tmp/riic-m5-review-20260918/`; original hashes
and candidate copies are retained separately there. Previous `/tmp/riic-m5-evidence/`
logs and the prior build manifest were verified on recovery, but runtime/test fixes
require fresh gates. The canonical candidate hashes are refreshed after edits.
No real PostgreSQL execution, production annotation read, private runtime artifact
or external model quality is validated. This is offline engineering acceptance;
user review still decides formal M5 closeout. No generic RAG or later milestone
work is necessary or started.

Fresh build copy: `/tmp/riic-agent-closeout-CS8r1q`. Its complete public source
manifest matches the candidate except these two evidence-only Agent documents;
all runtime, tests, UI, configuration and fixture files match. Standalone server,
public and static assets exist and its localhost runtime passed mock browser
tests. Review changed seven files (three runtime, two tests, two documents);
the full preserved M5 candidate now has 22 files, all unstaged. Final hashes are
recorded in both the original canonical evidence directory and this review's
directory. No commit, push or deployment occurred.

## M5 Phase A — initial candidate evidence (historical), 2026-09-18

This historical section superseded earlier M5 NOT_STARTED / next-task statements.
The initial task authorized only M5 Phase A implementation and offline validation, explicitly
excluding Commit, Push, Merge, Deploy, M6, production DB changes, real solver and
new real model requests. Existing M4 code and safety boundaries remain.

| Current state | Result |
| --- | --- |
| DIY_REMOTE_HEAD / DIY_LOCAL_HEAD | `07390a1462b91e1b007410b4f669f9b8bbd9b499` / same, initial worktree clean |
| UPSTREAM_MAIN_HEAD | `7665daf522aa89eaf2a7cd5523ac4c70093530ef` — freshly resolved, read-only audit |
| M4_STATUS | COMPLETE |
| M5_STATUS | IN_PROGRESS / AUTHORITATIVE_KNOWLEDGE_CANDIDATE |
| M6_STATUS | NOT_STARTED |
| GLM53_TOOL_CALLING_CAPABILITY / FUNCTION_TOOL_LOOP | Historical PASS / PASS; no new real acceptance |
| NORMAL_AGENT_TOTAL_MS / MODEL_HTTP_TIMEOUT_MS / TOOL_TIMEOUT_MS | 60000 / 15000 / 5000 — unchanged |
| MODEL_STEPS / TOOL_CALLS / REPORTED_TOKEN_LIMIT / MAX_RETRIES | 5 / 6 / 12000 / 0 — unchanged |
| IMPLEMENTED_KNOWLEDGE_TOOL | `knowledge.get_skill_context`, read, existing Loop/Registry/Policy |
| STRUCTURED_SKILL_DATA | Existing DIY arkntools catalog, exact stable-ID/name resolution; available offline |
| SKILL_ANNOTATION | Existing publicly readable rows; note/updatedAt-only SELECT and whitelist DTO; synthetic tests only |
| TRAINING_ADVICE_KNOWLEDGE | BLOCKED_PRIVATE_ARTIFACT — public filename metadata only; no content/schema/license verified |
| RELEASE_NOTES | Audited published API/storage; not integrated in Phase A |
| EXTERNAL_BUSINESS_TOOL_VISIBILITY | UNAVAILABLE — external providers lose capability, classification whitelist not expanded |
| REAL_BUSINESS_EGRESS_RELEASE | BLOCKED_PROVIDER_POLICY |
| TARGETED_TESTS / AGENT / GOLDEN / API_CONTRACT | PASS 31/31 / 345/345 / 42/42 / 76/76 |
| TSC / CHECK / DIFF_CHECK | PASS / PASS / PASS |
| BUILD / STANDALONE | PASS — isolated cloud-enabled webpack, standalone preparation and assets verified |
| E2E | PASS 7/7 — mock browser cases, no skips |
| MODEL_HTTP_REQUESTS_THIS_ROUND | 0 |
| COMMIT / PUSH / DEPLOY | NOT_PERFORMED / NOT_PERFORMED / NOT_PERFORMED |

See [M5 design, exact source inventory, provenance, Tool/DTO and limits](m5-authoritative-knowledge.md).
The installed DIY structured-data source commit is `593aa9d5b9b87c27eea762994a376f579a6e9038`,
while audited upstream is `302105b1404bd488c4700d063da9dcf3661a94f0`. No upstream sync or
asset replacement occurred. Source version identifies the actual installed data,
not the latest upstream commit; content revisions hash the projected facts.

The existing annotation schema has no draft/published state. All its rows are
already public through GET /api/skill-annotations. Agent uses only the same public
note/update fields for an exact operator/skill pair; it does not expose row IDs,
creator/editor IDs, audit metadata or future fields. A DB/read/schema failure is
unavailable, not absent. Production annotations and DB contents were not accessed.

Grounding uses validated observations, explicit absent/missing/ambiguous handling
and separate structured/manual attribution. Final skill facts are rendered by
code after the existing refill, so a fake provider cannot fabricate an annotation
or citation. This is a bounded offline grammar and single-skill extract, not a real
LLM quality evaluation, recommendation rationale, or official game statement.

Offline logs are outside Git under `/tmp/riic-m5-evidence/`. Build uses the isolated
copy `/tmp/riic-agent-closeout-M3QoKN`; its public source manifest matched the
candidate before final evidence-only documentation updates. Tests use synthetic
notes/Session/repositories and mock network boundaries, not a live DB or model.
Initial sandbox Node/Build invocations failed on subprocess restrictions and were
rerun with the same clean offline environment outside the sandbox. The first
check stopped on a control-character-regex lint rule; the character-code fix and
full rerun passed. No such failed attempt is counted as a passing gate.

FINAL_REVIEW = PASS (inline candidate review); HIGH_OPEN = 0; MEDIUM_OPEN = 0.
Two MEDIUM candidate gaps were fixed with failing tests before final gates:
(1) payload-boundary descriptors/forced calls needed the existing classification
map guard; (2) a recognized skill query could finalize without a tool observation.
The first now fails closed without expanding the map; the second requires an ok
knowledge result and deterministic grounded rendering. A test-only source scan
initially mistook crypto hash `.update()` for DB mutation; the SQL-generation test
checks the actual SELECT and absence of writes, while import checks guard private
runtime/solver dependencies. No production behavior was changed for that false
positive.

| Final review focus | Evidence / conclusion |
| --- | --- |
| Cross-user/admin/private leakage | Session-issued actor checked twice; globally public row semantics verified at upstream SHA; SELECT only note/update time, exact pair binding; strict public projection rejects future output fields |
| External egress | Capability stripped for all external providers; simulated approved-business test still cannot read it; API blocked path cannot construct knowledge; original four-tool map unchanged |
| SQL/file/M6 | No arbitrary query/path/URL inputs; parameterized SELECT, no write/solver/runtime-data import; no schema or package changes |
| Provenance/grounding | Actual installed version + content revision; manual versus structured remains separate; absent/unavailable differ; model text/citations cannot override knowledge facts |
| UI/compatibility | Strict source parser, actual update/sample display; 7/7 mock E2E; existing M0/M4 Golden and complete offline checks pass |
| Validation limits | No real DB contents, PostgreSQL integration, solver artifact, real provider or real business egress tested/released |

All runtime/test/UI files match the build manifest; only the final evidence
sections in the two Agent documents changed afterward. MODEL_HTTP_REQUESTS_THIS_ROUND
remains 0; historical effective acceptance usage remains 46/100, unchanged.
M5 remains an IN_PROGRESS candidate, not COMPLETE. Next minimum task is user review
of this candidate; publication or any live acceptance requires separate authorization.
Stop here; no automatic Commit/Push, deployment, generic RAG or M6.


## M4 post-closeout compatibility / real-model acceptance follow-up — 2026-09-15

**M4 remains COMPLETE.** This follow-up closes compatibility diagnostics, controlled synthetic acceptance and the generic Agent run budget on the existing M4 work line. It introduces no new milestone. This section supersedes older current-state statements below; historical evidence and its limitations remain historical.

| Current state | Result |
| --- | --- |
| M4_ENGINEERING_CLOSEOUT | COMPLETE |
| GLM53_TOOL_CALLING_CAPABILITY / FUNCTION_TOOL_LOOP | PASS / PASS |
| CURRENT_SCENARIO / SAVED_SCENARIO | PASS / PASS |
| EXPLICIT_CHAT_LEGACY_ACCEPTANCE | PASS |
| STANDARD_PROFILE_ACCEPTANCE | BLOCKED_OPTIONAL_REASONING_EXTENSION |
| BASIC_COMPLETION / JSON_OUTPUT | PASS / PASS |
| STRUCTURED_OUTPUT_CLIENT_VALIDATION | PASS |
| SERVER_STRICT_ENFORCEMENT | NOT_PROVEN |
| MODEL_HTTP_TIMEOUT_MS / NORMAL_AGENT_TOTAL_MS / TOOL_TIMEOUT_MS | 15000 / 60000 / 5000 |
| MODEL_STEPS / TOOL_CALLS / REPORTED_TOKEN_LIMIT / MAX_RETRIES | 5 / 6 / 12000 / 0 |
| REAL_MODEL_ACCEPTANCE_HTTP_ATTEMPTS | 8 — completed controlled synthetic run |
| GLOBAL_ACCEPTANCE_BUDGET_EFFECTIVE_USED | 46/100 |
| GLOBAL_ACCEPTANCE_BUDGET_SAFE_REMAINING | 54 |
| ACTUAL_HISTORICAL_USED_EXACT | UNVERIFIED |
| MODEL_HTTP_REQUESTS_THIS_ROUND | 0 — final engineering/commit/push round |
| REAL_BUSINESS_EGRESS_RELEASE | BLOCKED_PROVIDER_POLICY |
| REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY |
| M4_REAL_SOLVER_VALIDATION | NOT_RUN / BLOCKED_MISSING_SOLVER_ARTIFACT |
| M5_STATUS / M6_STATUS | NOT_STARTED / NOT_STARTED |
| DEPLOY | NOT_PERFORMED |

### Completed real synthetic evidence

The authorized run used `protocol=chat_completions`, `model=zhipu/glm-5.3`, upstream identity `https://moma.cmecloud.cn/v1`, and explicit `explicit_chat_legacy`. It ran the full server-owned synthetic fixtures against the existing Loop/Registry/M2 through the controlled broker. The first full run passed and stopped after eight HTTP attempts: one basic, one JSON, one structured intent, two current rounds and three saved rounds. The longest HTTP attempt was approximately 10.96 seconds; the existing 15-second HTTP cap was sufficient. A valid structured response establishes client validation, not reliable server-side strict enforcement. The standard profile's optional reasoning-extension blocker remains separate from legacy PASS.

Current executed `current_plan.get_room_detail` and `current_plan.get_summary`, both with valid arguments and Registry/M2 status `ok`. Two observations were refilled as Chat `role=tool` with matching `tool_call_id`. Active shift, trade_1, shift count 2, planned operator 贸易甲, unavailable observed snapshot, final answer facts and code-derived sources passed.

Saved completed `saved_plan.list` → list result refill → `saved_plan.compare` → result refill → final. Compare used the actual authorized IDs returned by list, not guessed IDs. Both tools returned `ok`; the foreign-owner negative control stayed denied. Natural-24h LMD 100 / 150 and right-minus-left 50, both saved-plan sources and final answer checks passed.

Accounting is **32 confirmed + 6 legacy unreconciled reserve + 8 newly controlled attempts = effective 46**. The reserve is not confirmed usage. Effective usage moved from 38 to 46, leaving 54 of the global 100 limit; no historical reconciliation or refund occurred. All sends used the controlled broker; the runner received a run token, never the upstream key. The completed run is closed and authorization disabled. Safe per-attempt evidence and source hashes are retained privately outside Git; raw provider responses, arbitrary text and reasoning are not retained.

The real run was on HEAD `7366d281a9038ad9aa37ff49956dbd3bb0b969df` plus the then-current uncommitted diagnostic/controlled-acceptance candidates. This final engineering follow-up does not repeat real calls or claim a new real run on the resulting commit. It validates the final changes offline. The broker, operator authorization implementation and atomic ledger live outside the repository and are **not production components published by this Git commit**; only the supported CLI integration and its tests/docs are included.

### Generic runtime adjustment and final review

The three saved HTTP rounds took about 21.5 seconds in total. The normal Agent total budget is therefore now 60 seconds, matching the previously explicit synthetic total budget. The 15-second model HTTP cap, 5-second tool cap, 5 steps, 6 calls, 12000 reported tokens, zero retries and all schema/egress/ownership/no-write checks remain. Browser/API bodies cannot specify deadline or synthetic overrides. No vendor/model name selects budgets or compatibility mode.

Final review found and fixed one MEDIUM issue: the SDK clears its timer after response headers, leaving response-body consumption without its own HTTP deadline. Both protocol transports now share a full-operation deadline guard with caller-cancellation precedence, cleanup and safe timeout provenance. The existing broker already buffered full upstream responses under its own deadline, so this issue does not invalidate the completed real acceptance. Offline slow-body tests reproduced the failure before the fix; fake-time tests reproduce the old 20-second cutoff and verify the new 60-second boundary, cancellation and rejection of late results.

| Final offline gate | Result |
| --- | --- |
| FINAL_REVIEW | PASS — HIGH 0, MEDIUM 1 fixed / 0 open, LOW 0 |
| TARGETED_TESTS | 80/80 — diagnostics, both protocols, 60s budget, API and broker entry |
| OPERATOR_TESTS | 28/28 — rerun against final runtime; fake credentials/local endpoints only |
| AGENT / GOLDEN / API_CONTRACT | 306/306 / 34/34 / 76/76 |
| TSC / CHECK / DIFF_CHECK | PASS / PASS / PASS |
| BUILD / STANDALONE | PASS — isolated cloud-enabled webpack; standalone preparation completed |
| E2E | 6/6 — mock Agent browser cases, no skips |
| MODEL_HTTP_REQUESTS_THIS_ROUND | 0 — global effective usage remains 46/100 |

The new budget and slow-body tests first failed on the old behavior and then passed after the minimal fixes. Sandbox subprocess/socket restrictions were handled by rerunning the offline commands with the explicit isolated test environment; those failed sandbox invocations are not reported as passing tests. Build and E2E used a fresh copy containing all final runtime changes and existing candidates, with source hashes verified against the worktree. Only this gate-result documentation was filled in afterward. Operator state, private evidence and ignored local instructions remain outside the commit.

Synthetic compatibility PASS does not approve provider processing or real user egress. Existing M0 tools and M4 preview remain within their approved read-only/compute-only scope; no solver artifact, production database operation, write/RAG/memory/product multi-agent, deployment or next stage is introduced.

## M4 final engineering checkpoint — 2026-09-09

This section supersedes earlier current/next instructions. The latest task authorizes the M3.6 audit-only checkpoint followed by review, offline validation and publication of the existing M4 candidate. No M5/M6, deployment, production database or real model work is authorized or performed.

PHASE A isolated exactly the prior M3.6 re-audit additions using the preserved candidate hashes and the `6dff1a5b5f2faf75038e5802e30615ac78ce2760` baseline: three documents, 38 inserted lines, no runtime/tests/UI staged. Classification was M3_6_REVALIDATION_DOC_DELTA = 3 documents, M4_EXISTING_CANDIDATE = 28 files, AMBIGUOUS = 0. Commit **`8c35241d6391ab586beea519d61339fc19f0f4f2`** (`docs(agent): revalidate M3.6 egress release readiness`) was pushed to `origin diy/agent-m0-m3`; a fresh remote read matched local HEAD. The M4 candidate remained unstaged/untracked and intact. AGENTS.md remains ignored and unchanged at SHA-256 `cf10d57585e9de9e0992695560962bb3682e7e0e11893d67f95ffdf4f016335f`.

| Final engineering state | Result |
| --- | --- |
| FINAL_M4_CODE_REVIEW | PASS — HIGH 0, MEDIUM 0, LOW 1 fixed / 0 open |
| M4_ENGINEERING_CLOSEOUT | COMPLETE — bounded fake/synthetic compute-only preview |
| PLANNING_SERVICE_EXTRACTION / PLAN_PREVIEW_TOOL | COMPLETE / COMPLETE |
| M4_AUTHORIZATION / M4_BUDGETS / M4_NO_WRITE_GUARANTEE | PASS / PASS / PASS |
| M4_AGENT_INTEGRATION / M4_UI / M4_OFFLINE_VALIDATION | PASS / PASS / PASS |
| TEST_PLANNING_SERVICE / TEST_PLAN_PREVIEW | 9/9 / 11/11 |
| TEST_AGENT / GOLDEN / API_CONTRACT | 280/280 / 34/34 / 76/76 |
| TSC / CHECK / I18N / DIFF_CHECK | PASS / PASS / PASS / PASS |
| M4_BUILD | PASS — new isolated cloud-enabled webpack + standalone |
| M4_E2E | PASS — 6/6 mock browser cases, no skipped/failed cases |
| M4_REAL_SOLVER_VALIDATION | NOT_RUN |
| POSTGRES_MIGRATION_VALIDATION | NOT_VALIDATED_ON_REAL_POSTGRES — M3.6 Consent migration/persistence; M4 adds no schema |
| EXTERNAL_EGRESS_ENGINEERING | COMPLETE |
| PROVIDER_PROCESSING_EVIDENCE / PROVIDER_RELEASE_STATUS | INCOMPLETE / BLOCKED_UNVERIFIED_PROCESSING |
| REAL_BUSINESS_EGRESS_RELEASE / REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY / BLOCKED_PROVIDER_POLICY |
| MODEL_HTTP_REQUESTS_THIS_SESSION | 0 — no real external model calls |
| DEPLOY / M5_STATUS / M6_STATUS | NOT_PERFORMED / NOT_STARTED / NOT_STARTED |

Review details R1–R14 are in [M4 planning preview](m4-read-only-planning-preview.md). No runtime repair or redesign was needed. The single LOW finding was explicit Golden coverage for ordinary questions, failed previews and second attempts; new tests close that gap. Additional behavior tests exercise normal page HTTP validation/solver errors/cache inputs and verify saved-plan metadata remains unchanged. First-run test-fixture type/default-value errors were corrected before final passing gates; they are not represented as successful executions.

All listed gates were newly executed this round using clean fake/synthetic/mock dependencies. `npm run check` includes the service/preview/Agent/API/i18n suites and existing page/cache regressions; Golden and TypeScript also ran separately. Build and E2E used `/tmp/riic-agent-closeout-T1JeSx`, containing the current runtime and final tests. Only final audit documents were updated after creating that copy. Browser mock tests demonstrate UI behavior; backend tests exercise actual handler/Loop/Registry/shared service with a mock solver. These results do not establish real solver feasibility/performance, real MoMA processing, real PostgreSQL persistence or deployment readiness.

Original evidence packages remain intact (21/46/36/86/51 hashes); the prior M3.6 re-audit package also verified all 10 hashes. Final local review/test/publication evidence is retained outside Git under `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-09-m4-checkpoint/`. Both push checks inspect unchanged workflow triggers: this feature branch does not trigger deployment, real model calls or production mutation. M4 publication uses a normal commit/push without history rewrite; final local/remote SHA and worktree status are verified after push and recorded in that evidence package.

Stop after the M4 checkpoint. Suggested follow-ups only: **A. M4 real-solver/test-environment integration acceptance; B. Provider processing evidence; C. an explicit later M5/M6 decision.** None is started here.

## M3.6-only re-audit — 2026-09-09, latest task scope

This section supersedes earlier **next-task** instructions for this round. Fresh recovery found LOCAL_HEAD = REMOTE_HEAD = `6dff1a5b5f2faf75038e5802e30615ac78ce2760`, branch `diy/agent-m0-m3`, with no staged files and 17 modified + 11 untracked existing M4 candidate files. The older `74ae80e…` reference is historical. The original Chat compatibility/M3.6 checkpoint is already committed; no commit, push or deployment occurred in this re-audit. No reset, pull, merge, rebase, clean, stash or branch switch was performed.

The existing M4 candidate was preserved, not continued or removed. It would be inaccurate to label the whole repository M4 NOT_STARTED: **M4_WORK_THIS_ROUND = NOT_STARTED; M4_STATUS = EXISTING_LOCAL_CANDIDATE_PRESERVED**. Prior M4 results below are historical facts, not new development authorization. The external M3.6 whitelist still contains only the four M0 read tools; preview remains unavailable to external providers.

| State | Result |
| --- | --- |
| M3_ENGINEERING_CLOSEOUT / M3_COMPAT_PROVIDER | COMPLETE / COMPLETE |
| EXTERNAL_EGRESS_ENGINEERING | COMPLETE — release gate established, no Provider approval implied |
| PROVIDER_PROCESSING_EVIDENCE | INCOMPLETE — seven UNKNOWN facts, no VERIFIED processing fact |
| PROVIDER_RELEASE_STATUS | BLOCKED_UNVERIFIED_PROCESSING |
| PRIVACY_POLICY_UPDATE | COMPLETE — `2026-09-08-agent-external-processing`, effective 2026-09-08 |
| CONSENT_FLOW / PAYLOAD_BOUNDARY / EGRESS_GATE | PASS — offline security and mock UI validation |
| REAL_BUSINESS_EGRESS_RELEASE / REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY / BLOCKED_PROVIDER_POLICY |
| REAL_MODEL_VALIDATION | Historical synthetic compatibility only; no new endpoint or business-context validation |
| OFFLINE_VALIDATION | PASS — Agent 275/275; Golden 31/31; API contract 76/76; TypeScript, full check, i18n/legal, lint and diff |
| BUILD_VALIDATION | PASS — isolated cloud-enabled webpack and standalone preparation |
| E2E_VALIDATION | PASS — 6/6 mock browser cases, including consent states and preserved candidate regression |
| REAL_MODEL_REQUESTS_THIS_ROUND | 0 |
| COMMIT / PUSH / DEPLOY THIS ROUND | NOT_PERFORMED |

Security review found HIGH 0 / MEDIUM 0 and required no runtime repair. Verified pre-factory/provider-service blocking, session-only consent and exact version binding, per-send revoke checks, strict endpoint/protocol binding, default-off kill switch without bypass, explicit field projection/future-field rejection, run-scoped saved-plan aliases, safe errors/logs, bilingual independent opt-in and no retention/training claim based on `store=false`. Consent is policy-state storage, not a model-callable write tool. Full Box, credentials, raw diagnostics and unclassified fields remain prohibited. Arbitrary free text cannot be certified secret-free; the existing recognizable-secret rejection is not a perfect DLP guarantee.

New executions used the clean offline environment with no production/model configuration. Build and browser tests ran in `/tmp/riic-agent-closeout-qnru23`; all runtime/test source remained unchanged after this build, with only three audit documents updated. Agent/Golden counts include already-existing M4 tests; they are not claims of new M4 work. Consent migration 0016 schema/journal/ownership checks passed, but actual PostgreSQL migration and persistence execution remain unvalidated; deployment readiness is not claimed. No production database was accessed.

Recovery verified all original evidence packages (21/46/36 entries), M3.6 final evidence (86) and the existing M4 candidate evidence (51). All 28 existing candidate hashes matched at recovery. AGENTS.md remains ignored, unmodified and unstaged, SHA-256 `cf10d57585e9de9e0992695560962bb3682e7e0e11893d67f95ffdf4f016335f`. This round changes only this status document, the Data Map scope note and the Provider research supplement; original implementation is preserved. New local evidence is stored outside Git under `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-09-m36-reaudit/`.

Next minimum task: **补足适用于 MoMA API 的官方数据处理证据** — retention, training/improvement use and applicable processing terms first, with monitoring, region, subprocessors and deletion conditions also resolved as required. This does not authorize real model requests, business egress, M4 continuation or publication.

## M4 compute-only preview — local candidate, 2026-09-09

This section supersedes earlier current/next labels. PHASE A independent M3.6 review passed and checkpoint **`6dff1a5b5f2faf75038e5802e30615ac78ce2760`** was committed and pushed to `origin diy/agent-m0-m3`. A fresh remote read matched LOCAL_HEAD and the working tree was clean before PHASE B. The checkpoint includes the preserved Chat compatibility fixes and M3.6 engineering gate; it does not approve MoMA processing or real business egress.

| State | Result |
| --- | --- |
| PHASE_A_M3_6_REVIEW / COMMIT / PUSH | PASS / COMPLETE / COMPLETE |
| EXTERNAL_EGRESS_ENGINEERING | COMPLETE |
| PROVIDER_PROCESSING_EVIDENCE | INCOMPLETE — all seven MoMA facts remain UNKNOWN |
| PROVIDER_RELEASE_STATUS | BLOCKED_UNVERIFIED_PROCESSING |
| REAL_BUSINESS_EGRESS_RELEASE | BLOCKED_PROVIDER_POLICY |
| REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY |
| PHASE_B_M4_STATUS | COMPLETE_LOCAL_CANDIDATE — fake/synthetic compute-only scope |
| PLANNING_SERVICE_EXTRACTION | COMPLETE — same business core for HTTP and Tool |
| PLAN_PREVIEW_TOOL | COMPLETE — compute, explicit request, one rotation candidate |
| M4_AUTHORIZATION | PASS — server actor, opaque permit, snapshot fingerprint, base/current revision, narrow input |
| M4_BUDGETS | PASS — one attempt, existing admission, 5-second Tool / 20-second Agent budgets, no auto retry |
| M4_NO_WRITE_GUARANTEE | PASS — no saved-plan/Workspace/Box/apply operation; existing run/cache bookkeeping is separate |
| M4_AGENT_INTEGRATION | PASS — API → fake model → preview → shared core → mock solver boundary |
| M4_UI | PASS — existing Advisor Panel, explicit synthetic example, differences, failure/cancel/stale, not saved/applied |
| M4_OFFLINE_VALIDATION | PASS — service 7/7; preview 11/11; Agent 275/275; Golden 31/31; API contract 76/76; TypeScript/check/i18n/lint/diff |
| M4_BUILD | PASS — isolated current-runtime cloud-enabled webpack and standalone preparation |
| M4_E2E | PASS — 6/6 mock browser cases, no failures/skips |
| MODEL_HTTP_REQUESTS_THIS_SESSION | 0 — real external model requests |
| M4_COMMIT / PUSH / DEPLOY | NOT_PERFORMED |

Implementation and audit: [M4 read-only planning preview](m4-read-only-planning-preview.md). `/api/plan` now delegates HTTP work to `planning-api.ts` and shared validation/cache/admission/record/public-DTO work to `planning-service.ts`. The normal page keeps its existing real infra dependency and queued-deployment restrictions. M4's fake demo uses the same service with server-owned synthetic sample/solver/record dependencies, preserving shared admission and intentionally taking cache bypass; tests also exercise cache hits, leases, reference durability and cancellation. Existing infra timeout/fallback internals are retained; no second solver orchestration was created.

The local capability supports only a requested rotation change against the current versioned synthetic example. It cannot reconstruct or compute a real Workspace from the minimized Agent snapshot. The panel's checkbox changes only its synthetic request projection; it never changes the page plan. Preview numbers are authored mock outputs, not real production/feasibility/optimality evidence. External providers cannot see/call preview under this phase's policy, even after a future Provider approval; M3.6's external field whitelist remains unchanged and rejects this unclassified tool.

Cancellation does not claim to forcibly kill the existing private CLI: the Agent stops waiting and ignores late output, while the service holds admission until already-started non-cooperative execution settles. No later solver invocation is started after cancellation, and a failed/timed-out attempt consumes the run's only preview budget. No real private solver or production database was used for acceptance. M3.6's missing test PostgreSQL validation remains a separate deployment limitation.

Final new executions: `npm run check` PASS (Agent 275/275 including 7 shared-service and 11 preview tests, API 76/76, i18n/legal, lint and existing regressions); separate Golden 31/31 (included in Agent); installed TypeScript `--noEmit` PASS; `git diff --check` PASS. Isolated `ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack` + standalone PASS and `npm run test:e2e:agent` 6/6. Browser tests use mocked HTTP, while separate backend tests execute actual HTTP handlers/Loop/Registry/core with synthetic dependencies. The final two test-file additions and documentation updates postdate the build; all runtime, API, UI, legal, dependency/config and E2E fixture hashes match the tested build source.

The first isolated-copy attempt hit sandbox `spawnSync git EPERM`; the approved outside-sandbox copy succeeded. Intermediate missing-module/test-fixture failures were fixed and are not counted as passes. Local evidence lives under `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-09-m4-candidate/`, with separate PHASE A/B logs, candidate hashes, a public-source manifest and final status. Earlier evidence packages and AGENTS.md remain unchanged. HEAD is still the M3.6 checkpoint; no M4 staging, commit, push, deployment or real model acceptance occurred.

Next minimum task: **M4 最终 code review + checkpoint**. Stop here; no M5/M6 work.

## M3.6 checkpoint review — 2026-09-09, PHASE A

This is the final engineering checkpoint, including the previously reviewed Chat compatibility fixes. It supersedes earlier current/next labels; historical endpoint reports below remain historical. Recovery freshly verified LOCAL_HEAD = REMOTE_HEAD = `74ae80e967ef88bbc05ecde684488fd815e750e2`. All 53 candidate file hashes and all 1,856 final public source hashes matched the prior handoff. Earlier evidence packages verified 21/46/36 entries; the M3.6 package verified 86. AGENTS.md is unchanged, ignored and excluded.

| State | Result |
| --- | --- |
| FINAL_M3_6_REVIEW | PASS — HIGH 0, MEDIUM 0; no runtime repair required |
| M3_ENGINEERING_CLOSEOUT | COMPLETE |
| M3_COMPAT_PROVIDER | COMPLETE — engineering, not current real endpoint validation |
| EXTERNAL_EGRESS_ENGINEERING | COMPLETE |
| PROVIDER_PROCESSING_EVIDENCE | INCOMPLETE |
| PROVIDER_RELEASE_STATUS | BLOCKED_UNVERIFIED_PROCESSING |
| PRIVACY_POLICY_UPDATE | COMPLETE |
| CONSENT_FLOW | PASS — offline API/UI; live PostgreSQL execution remains unvalidated |
| PAYLOAD_BOUNDARY | PASS |
| EGRESS_GATE | PASS |
| REAL_BUSINESS_EGRESS_RELEASE | BLOCKED_PROVIDER_POLICY |
| REAL_USER_CONTEXT_TO_EXTERNAL_MODEL | BLOCKED_PROVIDER_POLICY |
| REAL_MODEL_VALIDATION | Historical synthetic compatibility evidence only; no current business-data validation |
| MODEL_HTTP_REQUESTS_PHASE_A | 0 |
| M4_STATUS | NOT_STARTED |

Independent review covered provider approval, session-only versioned consent, revoke, pre-factory fail-closed ordering, Loop/adapter rechecks, explicit projections and run-scoped saved-plan aliases, bilingual opt-in UI/privacy and the unchanged four-tool M0 registry. Endpoint/key/consent/private gateway/loopback/historical synthetic PASS cannot approve MoMA. Consent storage is policy state, not a model-callable business write. Migration 0016 is required and included; no production migration was run.

Newly executed gates: `npm run check` PASS, including Agent **251/251** (all M3.6 egress/consent/privacy/payload tests), API contract **76/76**, i18n/legal, lint and existing regressions; separate Golden **25/25**; installed TypeScript `--noEmit` PASS; `git diff --check` PASS. The first sandbox check failed subprocess-based tests; the same clean offline wrapper outside the sandbox passed. Logs for this round are local `/tmp/riic-phase-a-*`, excluded from Git. No production DB or model configuration was inherited.

Build/E2E were not repeated in PHASE A: runtime, dependencies, migration, API/UI and legal/i18n are byte-identical to the verified prior final candidate. Prior isolated cloud-enabled webpack build PASS and corrected mock Agent E2E **5/5** remain historical evidence, not newly executed tests. Missing test PostgreSQL remains a deployment-validation limitation; static migration checks do not replace it.

M3.6 COMPLETE means an engineering release gate exists. It does **not** mean MoMA processing conditions are confirmed or real business data may be sent. All seven processing facts remain UNKNOWN. The push-triggered quality workflow is limited to main/develop; other workflows require PR/schedule/manual/reusable triggers. Pushing `diy/agent-m0-m3` does not trigger deployment or model execution through these workflows.

PHASE A Commit/Push are explicitly authorized, conditional on these gates; their actual result is verified from Git after publication. Only after successful push and matching local/remote checkpoint may the separately authorized M4 compute-only local work begin. M4 Commit/Push/Deploy remain unauthorized. No M5/M6 work is included.

## M3.6 final engineering closeout — 2026-09-09 (Asia/Shanghai)

Current stage is External Model Business Data Egress Boundary, before M4. This section supersedes earlier **current/next** labels below without rewriting historical evidence. Recovery: `diy/agent-m0-m3`, LOCAL_HEAD and fresh read-only REMOTE_HEAD both `74ae80e967ef88bbc05ecde684488fd815e750e2`; 32 modified + 21 untracked files, none staged. A stale local remote-tracking ref is not the remote reading. The previous compatibility candidate contained 15 files after final review (the preceding offline closeout had 14); all remain present. Ten initially matched exactly and five had reviewed M3.6 deltas. Original handoff/offline/final-review manifests verified 21/46/36 entries respectively. AGENTS.md remains unchanged and ignored.

| State | Result |
| --- | --- |
| M3_ENGINEERING_CLOSEOUT | COMPLETE — original four read-only M0 tools retained |
| M3_COMPAT_PROVIDER | COMPAT_PATCH_PRESERVED; historical MoMA synthetic report only |
| EXTERNAL_EGRESS_ENGINEERING | COMPLETE — server gates, consent, payload projection and UI implemented |
| PROVIDER_PROCESSING_EVIDENCE | INCOMPLETE — no VERIFIED MoMA API processing facts |
| PROVIDER_RELEASE_STATUS | BLOCKED_UNVERIFIED_PROCESSING |
| PRIVACY_POLICY_VERSION | `2026-09-08-agent-external-processing`, effective date `2026-09-08` |
| USER_CONSENT_FLOW | PASS_OFFLINE_API_AND_MOCK_UI; PostgreSQL execution BLOCKED_ENVIRONMENT |
| MODEL_PAYLOAD_MINIMIZATION | PASS — explicit paths, unknown-field rejection, run-scoped plan aliases |
| REAL_BUSINESS_EGRESS_RELEASE | BLOCKED_PROVIDER_POLICY |
| DEPLOYMENT_READY | BLOCKED_PROVIDER_POLICY_AND_DATABASE_VALIDATION; not deployed |
| REAL_MODEL_VALIDATION | NOT_RUN_NOT_AUTHORIZED; real model HTTP requests 0 |
| M4_STATUS | NOT_STARTED |

API authorization runs before external-client and domain-service construction. Operator feature + independent default-off business kill switch + approved profile + exact endpoint/protocol/profile version + current privacy/egress deployment versions are all required. Session-user consent separately binds five version fields; revoke and version changes block subsequent sends. A run-bound process-local capability and each adapter recheck enforce the second boundary. Browser input cannot claim synthetic, approve a provider or grant consent for another user. M1 classifier and encrypted reasoning remain synthetic-only. No fallback, new business tool, solver, full Box or unrestricted IO was introduced.

The [Data Map](model-egress-data-map.md) lists actual wire fields and deletions; [Provider evidence](provider-data-processing.md) distinguishes UNKNOWN from VERIFIED; [Consent runbook](external-processing-runbook.md) describes operations, storage and withdrawal. English and Chinese privacy/UI copy describe independent opt-in, minimization, excluded credentials/diagnostics and the limits of withdrawal. Neither `store=false` nor user consent is a provider retention, training or legal assurance.

Final executed offline gates: Agent **251/251**, Golden **25/25** (included in Agent, not additional), installed TypeScript `--noEmit` PASS, `npm run check` PASS (including i18n/legal, lint, API contracts **76/76** and existing regressions), `git diff --check` PASS. Current-source isolated `ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack` and standalone preparation PASS. `npm run test:e2e:agent` **5/5**, mock browser flows only; actual two-protocol adapter → mock HTTP → M2/alias refill tests provide separate backend evidence. Drizzle generate in the isolated copy reports no schema delta; static schema/SQL/journal checks PASS. `test:auth-integration` was attempted with a clean environment and stopped for missing test database configuration; no PostgreSQL tools/test instance are available. This remains **BLOCKED_ENVIRONMENT**, not a database PASS, and no real DB was queried or migrated.

Final security review: HIGH 0, MEDIUM 0, LOW 1 fixed. The new default Consent browser mock was registered before a later catch-all route using `continue()`, so it was bypassed and old UI cases received local 401. Reordering fixture registration fixed the test; production source did not need changes during this resumed review. All five browser cases now execute. The initial browser run was interrupted after confirming the fixture fault; sandbox process/port failures and this unsuccessful run remain archived, not counted as passes. The production build matches all final runtime files; only the corrected E2E fixture and final documentation changed after build. The corrected E2E file was copied into the artifact before rerunning it.

Persistent evidence: `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-09-m36-final/` contains logs, recovery/compatibility comparisons, review findings, full candidate patch, changed-file list, final SHA-256 and build-source manifests. Earlier packages remain unchanged. Current hashes bind this offline candidate only; `HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED` remains. Historical MoMA Chat `zhipu/glm-5.3`, explicit legacy, basic/full PASS, 9 additional requests and broker 26/100 still apply only to that configuration/checked outputs. Client Schema PASS does not prove server strict enforcement; WorkBuddy is user testimony; the old CURRENT assertion, successful source fingerprint, precise times and environment remain unverified. Responses failures are retained below.

`REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY`; `COMMIT / PUSH / DEPLOY=NOT_PERFORMED`. Engineering completion is not release approval. The only next minimum task is to obtain official MoMA API retention, training/improvement and applicable processing terms (including scope/version/entity) sufficient for review; this does not authorize M4 or real business egress.

## Final code review — 2026-09-08, separate review round

Reviewed fixed baseline `74ae80e967ef88bbc05ecde684488fd815e750e2` through the current candidate, with LOCAL_HEAD and a fresh read-only REMOTE_HEAD both at that SHA on `diy/agent-m0-m3`. The initial 14 candidate files exactly matched the previous offline-closeout manifest; its 46 evidence hashes verified. Root AGENTS.md, CLAUDE.md, CONTRIBUTING.md, M0 and both protocol documents were checked; no override/nested rule applies. AGENTS.md remains unchanged and outside Git.

Final review gates: `npm run test:agent` **217/217**, `npm run test:agent:golden` **25/25** (included in Agent total), installed TypeScript `--noEmit`, `npm run check` and `git diff --check`: all PASS in this review round. Final candidate: 15 changed files (13 tracked modifications and 2 new files), no staged changes. `FINAL_CODE_REVIEW=PASS`; `HIGH_FINDINGS=0`; `MEDIUM_FINDINGS=0`; `LOW_FINDINGS=2` (both fixed); `COMPAT_PATCH_READY_TO_COMMIT=YES`.

R1–R10 final review: PASS. No HIGH or MEDIUM issue found. Two LOW test-coverage findings were closed: the old-environment test previously passed values only to `readModelConfig`, so it could not detect import-time `process.env` regressions; and the deadline test exercised the Loop without traversing the API handler. A fresh-process mock-HTTP test now sets old acceptance variables before module loading and checks default rejection, explicit legacy acceptance and unchanged budgets. An actual API → Loop → M2 test observes the 20000/5000 ms timers and verifies browser compatibility/deadline overrides fail before provider construction. No runtime implementation was changed or refactored in this review.

Legacy's only switch-dependent behavior remains allowlisted omission of non-null Chat reasoning/reasoning_content/reasoning_details/audio from protocol history. Only synthetic runner and tests opt in; ordinary factories use false, the HTTP API has no compatibility input, and external business context remains blocked. Deprecated function_call and generated call IDs stay rejected. Schema prompts stay in Chat; requests, strict flags, whole-JSON parsing, local shape/semantic validation, IDs and domain checks are unchanged. R1's supplier-neutral conclusion concerns compatibility selection: the pre-existing documented `api.openai.com` host rejection remains unchanged and is not a vendor fallback or new compatibility special case.

This round changes tests and this status record only, relative to the previous candidate. Build/E2E are not rerun: runtime source, dependency manifests, Next/build configuration, API/UI, E2E fixtures and offline build/browser entrypoints are byte-identical to the prior isolated PASS artifact's source manifest. Prior build PASS and E2E 4/4 are historical offline artifact evidence, not new executions in this review. New evidence is under `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-08-moma-final-review/`, separate from both previous packages.

Historical MoMA configuration PASS remains a user/server report; the current patch is consolidated from archive and offline regression and has not been revalidated against the real endpoint. `HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED`; `REAL_ENDPOINT_VALIDATION_THIS_ROUND=NOT_RUN_NOT_AUTHORIZED`; `MODEL_REQUESTS_THIS_ROUND=0`; `REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY`; `COMMIT / PUSH / DEPLOY=NOT_PERFORMED`. No new feature or M4 work.

## Compatibility patch closeout — 2026-09-08, offline evidence

Scope: consolidate the seven archived dirty-worktree patches after synthetic MoMA acceptance. M3 remains complete; no M4, commit, push or deployment. LOCAL_HEAD and one freshly read REMOTE_HEAD both `74ae80e967ef88bbc05ecde684488fd815e750e2`, branch `diy/agent-m0-m3`; no branch switch, pull or upstream synchronization.

Original handoff `SHA256SUMS` SHA-256 is `9c0dedc46f43d1dbd0f4d1c75559a42bc822c572f1c83a35e5d5501d62b3a398`: all 21 entries verified. Seven archived modifications exactly matched the initial worktree; four committed references matched both baseline and worktree. The archived patch independently reconstructed all seven files from the fixed baseline in scratch storage. No reapplication to the user worktree, no post-archive changes found. Original handoff remains unchanged; new evidence is separate. AGENTS.md remains ignored, untracked and unchanged; its Responses-only implementation note is historical and superseded by actual dual-protocol source, not edited here.

Seven-patch disposition: retain the room schema clarification; retain and extend smoke fact classifications; retain the Chat-only Schema hint and empty tool-content handling; adjust Chat transport to explicit per-call legacy selection; replace global/unbounded timeout handling with bounded synthetic options and normal API clamps; update both documentation patches with distinct historical and current evidence. Fenced/embedded JSON extraction, generated old function-call IDs and environment-driven compatibility are not included. A discovered smoke error-wrapper regression is fixed: safe underlying capability/terminal codes survive, so rate/server failures stop further HTTP attempts. No fallback or response repair is introduced.

The three archived Python scripts were reviewed, not executed or copied into the repository. They lack original baselines; full evolution is not established. Supplier defaults, broker credentials/control socket, retries and private orchestration stay outside the product. Reusable option parsing is integrated into the existing synthetic command and shared runner. Compatibility details and timeout meanings are documented in [compatible provider](compatible-provider.md).

Historical user/server report dated 2026-09-08: `https://moma.cmecloud.cn/v1`, `chat_completions`, `zhipu/glm-5.3`, explicit `--chat-legacy-compat`, `--agent-strict-ms 30000 --agent-total-ms 60000 --agent-tool-ms 12000`; basic/full PASS, historical additional 9 requests (1+8), broker cumulative 26/100. The 30000 ms value bounds the outer structured probe, 60000 ms each current/saved Loop scenario, and 12000 ms tool waiting constrained by remaining scenario time. Chat HTTP stays capped at 15000 ms. Broker/control-client timeouts are separate.

That PASS covers only the tested configuration and checked outputs; client Schema success is not reliable server Schema enforcement. WorkBuddy's Schema counterexample has only user testimony, no original evidence. Historical CURRENT failure assertion is unconfirmed. Successful-run source hash, precise start/end times and environment snapshot were not captured. `HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED` remains unchanged. This round has zero real model requests and does not repeat endpoint acceptance; final revised code cannot inherit historical real PASS. Earlier Responses failures below are preserved, not overwritten by Chat success.

`REAL_ENDPOINT_VALIDATION_THIS_ROUND=NOT_RUN_NOT_AUTHORIZED`; `MODEL_REQUESTS_THIS_ROUND=0`; `REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY`; `COMMIT / PUSH / DEPLOY=NOT_PERFORMED`. Strict request shape, legacy parsing, client validation and unproven server enforcement are separate claims. Historical evidence gaps do not block engineering review.

### Final offline gates and new provenance

Final source: Agent tests **215/215**, Golden **25/25** (already included in 215), installed TypeScript `--noEmit`: PASS; `npm run check`: PASS including lint and existing API/shift regressions; `git diff --check`: PASS. Final isolated cloud-enabled webpack build and standalone preparation: PASS; Agent E2E **4/4**, zero failures/skips. The final gate records contain actual UTC start/end times and exit codes; they do not backfill historical acceptance timestamps. No dependency installation, real database connection, model request or original-service build occurred.

Final build copy: `/tmp/riic-agent-closeout-pyFY5M`. Its non-document public source hashes match the final worktree. New evidence directory: `/root/riic-web-agent-lab/acceptance-handoffs/2026-09-08-moma-offline-closeout/`; `tested-source-manifest.json` SHA-256 `c1d06fd9f090dcb7c6e97ca4c390ceb933a1cc36e3aa7bb78e4f55d3ee852bec`. `final-files.sha256` lists every final changed/new file; `source-gates.json` and `artifact-gates.json` bind actual runs to their logs. Documentation was finalized after these runs; final hygiene/diff checks cover this documentation-only update.

Initial sandbox child-process failures, the discovered error-wrapper test failures, and the lint control-regex failure are retained as unsuccessful intermediate evidence. A successful earlier build used a superseded source copy and is not the final build evidence. Final runs above replace intermediate outcomes; repeated tests are not accumulated into the coverage count. No live acceptance or network dependency audit was run in this offline scope.

`ARCHIVE_INTEGRITY=PASS`; `WORKTREE_ARCHIVE_MATCH=INITIAL_EXACT_FINAL_REVIEWED_DELTA`; `HISTORICAL_TESTED_SNAPSHOT_MATCH=UNVERIFIED`; `COMPAT_PATCH_DELIVERY=READY_FOR_REVIEW`; `OFFLINE_VALIDATION=PASS`. Historical evidence gaps remain, but no required offline gate is blocked. AGENTS.md is unchanged and not added to Git.

## Historical endpoint acceptance — user-run Chat basic, after 74ae80e

- Evidence: the user ran the supplied basic-only command, which pins HEAD to `74ae80e967ef88bbc05ecde684488fd815e750e2`, and supplied its sanitized JSON summary. The assistant did not execute a real model request or inspect raw responses/credentials. The earlier OpenRouter proposal made zero model requests; the user explicitly selected this MoMA configuration before execution, not as an automatic fallback.
- Configuration identity: endpointId `3069b2c951c6`; protocol `chat_completions`; requestedModel `zhipu/glm-5.3` (exact case); requestShape `m3.5b-strict-tools-v1`; mode `basic`; requestLimit `1`.
- Outcome: overall `CAPABILITY_INCOMPATIBLE`; `basicCompletion=FAIL`; `AGENT_CHAT_CONTINUATION_UNSUPPORTED`; stage `basicCompletion`; category `continuation`; upstreamCode/upstreamType `UNKNOWN`; rootCause `UNRESOLVED`. Actual HTTP status is not present in this summary and is not inferred as a specific status code.
- Request accounting: **1 user-run model HTTP attempt**. No retry, alternate protocol/model or full run. JSON/strict/current/saved are all `BLOCKED` with `BASIC_MODE_ONLY` and zero requests; `functionToolLoop=BLOCKED`. This is not evidence that those unexecuted capabilities fail or are unsupported.
- Code-local finding: at this checkpoint, `validateChatEnvelope` rejects any non-null/non-undefined `reasoning`, `reasoning_content`, `reasoning_details`, `function_call` or `audio` field on the assistant message. Even an empty string or array triggers that guard. The summary does not identify which field was present, its shape, or whether it actually represented required continuation. Do not attribute the failure to a particular field or conclude that all Chat/Tool Calling is unsupported. The failure reached this local parser guard; it is not the earlier Responses routing diagnosis.
- `reportedModels=[]` and `usage=unavailable` do not prove the upstream omitted these fields: validation throws before model/usage tracking. Do not infer zero billing. No hidden reasoning or response body is needed in the public evidence.
- Historical MoMA Responses evidence below remains two attempts / eight HTTP attempts, root cause UNRESOLVED; this is a separate third manual acceptance attempt with one HTTP attempt. M3 local engineering delivery remains complete, real business egress remains `BLOCKED_PRIVACY`.
- Next evidence needed: bounded diagnostic field identity and value shape/emptiness, without values or hidden reasoning, plus the applicable continuation contract. Do not remove the guard merely to obtain PASS. No further model call (including another basic) or full run is authorized by this result; full still requires basic success and separate authorization.

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
