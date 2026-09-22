# M5 Phase A: Existing Authoritative Knowledge Integration

M5_STATUS = COMPLETE. M5_ENGINEERING_CLOSEOUT = COMPLETE.
M4 COMPLETE; M6_STATUS = NOT_STARTED; M7_STATUS = NOT_STARTED.

## Final local engineering closeout — 2026-09-22

The user-side reviewer accepted the M5 completion criteria and authorized this
documentation-only local checkpoint. No runtime, tests, UI or assets changed.
No Commit, Push, Merge or Deploy is authorized or performed.

Fresh DIY local/remote HEAD: `07390a1462b91e1b007410b4f669f9b8bbd9b499`.
Fresh upstream main: `95ed0c699b50befbef90d83314bccbd6915e26bd`.
Since the accepted `9ab547fdfff60ec5031b557e24fd9b98e515a119` audit, upstream
changed eight paths for Live Activity status icons, animation/palette, associated
planning UI tests, and removal of the thinking-orbs dependency. No catalog,
annotation, Session/Actor, runtime knowledge or Agent contract changed. The CSS
changes are scoped to those activity/status classes, unused by AdvisorPanel.
UPSTREAM_DRIFT_M5_IMPACT = NONE; no upstream code, dependency or asset was synced.

Completion covers the first authoritative knowledge loop: existing structured
building-skill data + public manual skill annotation → deterministic Knowledge
service → `knowledge.get_skill_context` → existing Agent Tool Loop →
server-authored provenance → grounded answer. Automatic selection/refill and
answer acceptance are fake/offline acceptance, not real-model evaluation.

| Completion criterion | Final accepted result |
| --- | --- |
| Structured skill deterministic lookup | PASS |
| Annotation available/absent; unavailable distinguished | PASS |
| Missing/ambiguous fail closed | PASS |
| Admin/DB private field leakage | 0 |
| Knowledge Tool automatic selection / observation refill | PASS / PASS |
| Grounded final answer / server-authored provenance | PASS / PASS |
| Manual annotation source separation | PASS |
| External business visibility | BLOCKED / PASS |
| Business writes / solver invocation | 0 / 0 |
| M0/M4 regression | PASS |
| Vector RAG needed for this use case | NO |

STRUCTURED_GAME_DATA_SOURCE = CURRENT_DIY_BUILD_PINNED_CATALOG.
STRUCTURED_GAME_DATA_VERSION = `593aa9d5b9b87c27eea762994a376f579a6e9038`.
SKILL_ANNOTATION = PUBLIC_EXISTING_RECORDS / READ_ONLY.
TRAINING_ADVICE_KNOWLEDGE = BLOCKED_PRIVATE_ARTIFACT.
RELEASE_NOTES = AUDITED_AVAILABLE / NOT_IN_M5_V1.
REAL_BUSINESS_EGRESS_RELEASE = BLOCKED_PROVIDER_POLICY.
REAL_USER_CONTEXT_TO_EXTERNAL_MODEL = BLOCKED_PROVIDER_POLICY.
EXTERNAL_BUSINESS_KNOWLEDGE_TOOL = UNAVAILABLE.
REAL_POSTGRES_VALIDATION = NOT_RUN.
PRODUCTION_ANNOTATION_VALIDATION = NOT_RUN.
REAL_MODEL_VALIDATION = NOT_RUN.

COMPLETE does not mean latest game data, Hypergryph-endorsed annotation, private
training-advice or release-note integration, completed generic document RAG,
external business egress approval, production annotation acceptance or real-model
M5 acceptance. All source/access/grounding limitations below remain in force.

Recovery verified all 22 accepted candidate hashes and both previous evidence
hash manifests. All 1,875 build-source entries verify; current runtime/test/UI
match the accepted build. The final manifest changes only these two documents.
Final evidence: `/tmp/riic-m5-final-closeout-20260922/`.
Previous evidence: `/tmp/riic-m5-revalidation-20260918/final-evidence.json`.
Targeted 42/42, Agent 356/356, Golden 42/42, API 76/76, TSC and check are verified
previous-stage PASS, NOT rerun in this closeout. Build/standalone/E2E remain
VERIFIED_EXISTING_CANDIDATE_EVIDENCE (E2E 7/7), NOT rerun. Only final diff/hash and
evidence integrity checks execute anew. MODEL_HTTP_REQUESTS_THIS_ROUND = 0.

## Accepted candidate history

Repeat final-review revalidation, 2026-09-18: fresh DIY local/remote remain
`07390a1462b91e1b007410b4f669f9b8bbd9b499`; fresh upstream remains
`9ab547fdfff60ec5031b557e24fd9b98e515a119`. The same 13-path password-policy
delta from the initial upstream audit has no M5 impact. Recovery matched all
22 candidate hashes and the prior evidence hashes. Re-reading the read adapter,
public annotation API/schema, DTO, Session/Policy/Loop, egress boundary, grounding
and source UI found no additional HIGH/MEDIUM/LOW issues; no runtime/test/UI edits
were needed. The three MEDIUM fixes below belong to the preceding review.
Current execution evidence is in `/tmp/riic-m5-revalidation-20260918/`, separately
from that review. Build/standalone/E2E are VERIFIED_EXISTING_CANDIDATE_EVIDENCE:
all 1,875 copied source hashes verify, current runtime/test/UI match, and only the
two evidence documents differ from the build manifest. See implementation-status
for freshly rerun offline gates and the explicit historical build/browser status.

This phase implements the user's approved skill-context design, not generic RAG.
No embedding, vector database, crawler, upload, OCR, solver, writes or external model calls.
No Commit, Push, Merge or Deploy. Existing M4 behavior, policy and budgets stay fixed.

## Implementation plan

Execution uses the writing-plans / executing-plans / TDD workflows inline. The user's
explicit candidate implementation authorization supersedes extra design approval,
commit and subagent steps. All tests use offline dependencies.

- [x] Establish targeted service/Tool tests before implementation: existing Amiya
  `char_002_amiya` / `control_tra_spd_000`, projection, absent/unavailable annotation,
  missing/ambiguous resolution, strict schemas and server-issued actor.
- [x] Implement `knowledge-contract.ts`, `skill-knowledge-service.ts`, narrow
  `skill-knowledge-read-server.ts` and `tools/skill-context.ts`. Only the read adapter
  holds a scoped SELECT; the tool receives a restricted service.
- [x] Add offline Registry/Policy/Loop/API integration tests, then wire the optional
  knowledge service. Strip it for every external provider; leave M3.6 projection
  whitelist unchanged. Test direct payload-boundary rejection too.
- [x] Add bilingual Golden questions and source contract/UI tests. Source metadata
  is constructed by the server. Final knowledge facts stay separate by provenance;
  missing/ambiguous/error observations cannot become success.
- [x] Run targeted tests, Agent, Golden, API contract, TypeScript, full check, diff;
  create an isolated current-source copy, build/prepare standalone, run mock E2E.
- [x] Review leakage, actor forgery, external egress, future fields and grounding;
  fix HIGH/MEDIUM findings and rerun affected gates. Document evidence and stop.

## Recovery and source audit

Initial implementation audit on 2026-09-18 (historical candidate baseline):

- DIY remote/local `07390a1462b91e1b007410b4f669f9b8bbd9b499`, branch
  `diy/agent-m0-m3`; initially clean, no staged changes.
- Upstream main `7665daf522aa89eaf2a7cd5523ac4c70093530ef`, read only.
- M0 contract, compatible-provider, M3 architecture, M4 design and status were
  read from the same DIY HEAD. M4 COMPLETE; historical GLM53 tool calling and
  FUNCTION_TOOL_LOOP PASS. No new real endpoint acceptance is claimed.
- No reset, clean, stash, pull, merge, rebase or branch switch. Upstream objects
  were fetched by exact SHA without updating branches or FETCH_HEAD.

### Final review: fresh upstream revalidation, 2026-09-18

DIY local and freshly resolved remote remain
`07390a1462b91e1b007410b4f669f9b8bbd9b499`. Review began with 0 staged,
15 modified and 6 untracked candidate files. All 21 matched the previous
`/tmp/riic-m5-evidence/candidate-hashes.json`; the candidate and original hashes
were preserved before fixes.

Fresh upstream main is `9ab547fdfff60ec5031b557e24fd9b98e515a119`.
The delta from `7665daf522aa89eaf2a7cd5523ac4c70093530ef` changes 13 paths:
password-strength implementation/tests, password reset/account UI and localized
validation strings, production-foundation E2E, auth configuration and auth
PostgreSQL tests. The only auth configuration change lowers minimum password
length from 10 to 8; it changes neither Session issuance nor Actor authorization.
There are no changes to catalogs, annotation schema/API/public projection,
arkntools source, runtime-data/training knowledge, release notes, or Agent
Registry/Policy/Loop. UPSTREAM_DRIFT_M5_IMPACT = NONE. No upstream code or assets
were synchronized. Exact source inspection, not filename inference, supports this
conclusion; evidence is retained in `/tmp/riic-m5-review-20260918/`.

| Candidate / category | Evidence and actual provenance | Phase A decision |
| --- | --- | --- |
| Operator/building-skill catalogs — B STRUCTURED_GAME_DATA | `src/components/pages/SkillQuery.tsx` uses `OPERATOR_CATALOG`, `BUILDING_SKILL_CATALOG`; `operatorPortraits.ts` joins stable operator refs/index/elite/level with generated descriptions. `scripts/arkntools-assets-lib.mjs` reads arkntools character/building data and CN locales, and adds some project filter tags | Integrated: names, IDs, plain description and authoritative unlock/index fields. No raw assets, icons, arbitrary JSON or inferred tags/effects |
| Manual skill annotation — A PROJECT_AUTHORITATIVE | `app.skill_annotation`, schema and migration 0014; `/api/skill-annotations` and `skill-annotations-api.ts`; `SkillResultRow` displays note separately. Project maintained, not a Hypergryph statement | Integrated using scoped read adapter and smaller DTO |
| Runtime `operator_instances.json`, `skill_table.json`, `base_systems.json` — C PRIVATE_RUNTIME_KNOWLEDGE | `runtime-data.ts` checks deployment artifacts for infra runtime. These are not the generated catalogs used by skill query | Not read by Agent |
| `training_advice_knowledge.json` — C PRIVATE_RUNTIME_KNOWLEDGE_CANDIDATE | Only public occurrence is a runtime requirement filename; no tracked content/schema. `infra.ts` passes runtime data directory to private infra/serve integration and receives `response.result.training_advice` / protocol artifacts | BLOCKED_PRIVATE_ARTIFACT; public evidence is metadata only |
| Training advice report — D NOT_SUITABLE_FOR_M5_NOW | `training-advice-contract.ts` and tests validate solver report output. They do not define the private knowledge file schema or prove its content/provenance/license | Not integrated; no solver call |
| Published release notes — A PROJECT_AUTHORITATIVE | `release-notes.ts:listPublishedReleases` selects only published snapshots by environment; API validates public output. `src/releases/latest.ts` is immutable migration bootstrap fixture, not current runtime truth; migration 0015 | Deferred: product history is unnecessary for first skill-context loop |
| Draft releases, admin/audit fields — D NOT_SUITABLE_FOR_M5_NOW | DB/admin storage, not public skill knowledge | Excluded |

The initial and fresh audited upstream skill source commit is
`302105b1404bd488c4700d063da9dcf3661a94f0`; the DIY application's existing
`src/generated/arkntools/source.json` pins
`593aa9d5b9b87c27eea762994a376f579a6e9038`. Agent reads the **DIY installed
catalog**, not latest upstream assets. No asset synchronization occurred. The
pre-existing DIY-to-upstream difference includes a corrected rich-text description and pinyin search data;
it is not silently imported. Source DTO version is the installed arkntools commit;
revision is SHA-256 of the actual projected operator+skill content. This preserves
truth even when a generated description differs between app revisions. These are
third-party structured game resources, not an assertion of official endorsement.
The repository package declares PolyForm-Noncommercial-1.0.0; no independent
license or permission claim is made for unavailable private runtime artifacts.

Training knowledge: the public server checks file existence and supplies the data
directory to infra; no direct server parser of the knowledge JSON was found.
Consumption inside the private solver cannot be audited from this public source.
There is no verified artifact, file schema or artifact-specific license here. No
binary/data search, download or speculative schema was attempted. This does not
block public skill integration.

## Contract, authorization and read service

`knowledge.get_skill_context`, effect `read`, uses the existing Registry and Loop.
Input is an exact object with two required keys:

```json
{"operatorRef":"char_002_amiya","skillRef":"control_tra_spd_000"}
```

`operatorRef` is an exact existing name, stable ID, recognized short ID or existing
UI alias (max 100 characters). `skillRef` is an exact stable skill ID or name within
that operator (max 200), or null. Null succeeds only for one skill. No substring,
fuzzy, trained-memory or production-data inference. Duplicate names/refs are
ambiguous; unknown operators/skills are missing. Candidates contain only ID/name,
at most eight, with omitted count. Existing Amiya alias semantics are reused.
No model-supplied actor, user ID, DB ID, table, SQL, path, URL, ACL or admin identity.
Embedded control characters and additional input keys fail closed.

`AgentExecutionContext.knowledge` is a server-only restricted service. The normal
HTTP route still accepts only message/context and derives an opaque actor from
website Session. Registry and the service both check the issued actor. Public
knowledge is global, not user-owned: every row in the existing annotation table is
already publicly readable. The schema has **no draft/published flag**; inserting a
row makes it public under the existing product semantics. M5 invents no publishing
state and grants no extra access. If upstream introduces drafts or ACLs later, this
read adapter must be re-audited before adopting that schema.

Final review retains architecture B: the exact SELECT is appropriate for one
operator/skill instead of loading the public API's whole annotation list. There
is no second visibility predicate: neither path filters public rows by owner,
administrator, publishing status or Session. The schema-invariant test requires
review if table columns change; the existing public API test verifies anonymous
reads never check administrator identity. Negative tests exercise private/future
fields through observation refill, final answer and sources for two issued actors.

The adapter issues one parameter-bound SELECT with both operatorId and skillId,
selecting only note/updatedAt and limiting to one. It never imports the mutation
API, performs maintenance writes, refreshes accounts, invokes solver, or edits
Workspace/Box/saved plans. Existing public API still returns id/operatorId/skillId/
note/updatedAt; Agent additionally excludes DB row id. createdByUserId,
updatedByUserId, createdAt and future DB fields are never projected. No migration,
new package or private runtime dependency is introduced.

## Public DTO and sources

Tool output is validated before returning and again at the Tool boundary:

- status: ok / missing / ambiguous; stable issue code or null.
- operator: id/name; skill: id/name/plain description/index/elite/level, or null.
- annotation: available / absent / unavailable, public note and actual updatedAt,
  otherwise null. Read/parse failure is unavailable, never absent.
- candidates, explicit limitations and structural truncation count.
- source: type `skill_knowledge` and up to two server-authored entries. Each has
  sourceType, deterministic sourceId from operator/skill pair (no DB row ID),
  operator/skill ID/name, version, SHA-256 revision, sampledAt, updatedAt and fixed
  provenance label. No arbitrary URL or model reference.

Every object is exact-key validated, including nested objects and AgentSource.
Tool output max 12,000 UTF-8 bytes; description max 1,200 characters, note max
1,000; source count max two; candidate count max eight. Invalid/oversized facts
fail closed rather than truncating an effect mid-sentence. Existing Loop caps
16 KiB/result, 64 KiB observations and 3,000 answer characters remain.

STRUCTURED_GAME_DATA provenance is `arkntools/arknights-toolbox-data via RIIC-Web`.
Its version is the installed source commit; updatedAt is null because the catalog
has no actual publication timestamp. PROJECT_MANUAL_ANNOTATION provenance is
`RIIC-Web site-maintained manual annotation`; version is null, revision hashes
the projected note/target/update time and updatedAt comes from the row. sampledAt
is server read time, not a data version. No generated or guessed publication date.

Sources enter AgentFinalResult only after successful tool execution. The browser
strict parser rejects extra references/URLs and incompatible type/provenance.
Advisor Panel distinguishes structured data from site manual annotation, shows
the operator/skill and actual version/revision/update/sample metadata, and creates
no arbitrary citation links. Existing stale/cancel behavior is preserved.

## Grounding and offline integration

The existing LocalDemoProvider supports bounded Chinese/English examples and
`skill <operatorRef> | <skillRef>` (omit the pipe/skill for a null ref). This is an
explicit fake grammar, not a claim of real-model language understanding. Golden
objects are existing public Amiya catalog entries. Annotation fixtures and
conflicts are explicitly authored offline tests, never production notes.

Tool result refill uses the existing Loop observation. At finalization a validated
skill result is rendered deterministically; model text cannot replace its facts or
invent a manual note, precedence, citation or official attribution. An explicit
recognized knowledge question cannot finish successfully without an ok tool
observation. Any missing/ambiguous/failed tool keeps the existing failed-result
path. When multiple skill calls occur, the extract and final source list describe
only the last validated skill result; earlier skill/revision sources are removed.
This phase is a single-skill context use case, not cross-skill
comparison. No training recommendation/solver rationale is inferred from a skill.
“为什么这里建议…” returns skill evidence plus the explicit limitation that it does
not prove recommendation rationale or optimality.

Structured description and manual note are presented separately. The existing
product has no precedence rule; neither source overwrites the other. A conflicting
note stays a site-authored note beside structured data. Note content is data, not
instructions, including when it contains imperative language.

## External boundary and unchanged M4

Only fake/offline execution can receive the knowledge capability. Every external
provider has it removed before visibility/execution, including synthetic external
paths. The API constructs it only after Session and the server fake gate. No new
real model or database call occurs during tests.

M3.6's existing four-tool observation projection whitelist is unchanged. The
payload boundary additionally rejects descriptors, forced calls and observations
without an entry in that same map, before projection (including null observations).
Tests cover a simulated approved business
capability to prove that even future Provider approval alone cannot enable this
tool. This is fail-closed enforcement, not a Provider policy release.

REAL_BUSINESS_EGRESS_RELEASE = BLOCKED_PROVIDER_POLICY. New knowledge observation
has not undergone M3.6 field-level egress review. Future external availability
requires separate M5 classification, Provider processing evidence and consent /
egress review. GLM synthetic tool-calling PASS does not release these contents.
REAL_USER_CONTEXT_TO_EXTERNAL_MODEL = BLOCKED_PROVIDER_POLICY. Consent alone
cannot bypass the tool-level classification block.

M4 preview, no-write semantics, controlled acceptance, consent/provider policy and
budgets remain: 5 steps, 6 calls, 60,000 ms/run, 15,000 ms/HTTP, 5,000 ms/tool,
12,000 reported tokens, zero retries. M6 NOT_STARTED.

## Validation and remaining limits

Targeted coverage includes public skill facts, note present/absent/read failure,
creator/editor/future-field exclusion, exact SQL projection/target binding, unknown
and ambiguous objects, invalid args, forged actor, no write/solver/private-data
imports, fake selection/refill, hallucination suppression, server-only sources,
source revision, external visibility and forced-call refusal. Eight new Golden
cases cover Chinese/English skill, annotation, recommendation-evidence limits and
missing/ambiguous references. Existing M0/M4 Golden remains intact. Browser mock
coverage verifies both provenance labels, objects/version/timestamps, rejection of
arbitrary citations and unchanged local storage.

Executed gate results and final review are recorded in implementation-status.
No real PostgreSQL contents, production annotations, private solver, real external
model, or new external acceptance is validated. M5 engineering closeout is
COMPLETE within the accepted offline scope; it is not an egress release.

Knowledge answers match **current DIY build pinned structured game data**, not
the latest upstream catalog, latest game version or latest official data. M5 does
not automatically synchronize upstream/game assets. The actual pinned commit and
projected content hash remain exposed in server-authored provenance. Annotation
unavailable still permits separately identified structured facts, never a claim
that the annotation is absent or confirmed. Whole-tool failures remain failures.

Final code/security/architecture review reproduced and fixed three MEDIUM issues:
unclassified null observations could pass request projection; final sources could
retain earlier skills not used in the answer; fake knowledge grammar could
intercept an explicit saved-plan list command whose title looked like a skill
question. Regression tests failed before each fix. Existing four-tool egress
classification stays unchanged, final sources follow the grounded extract, and
explicit M0/M4 commands keep their arguments. No vendor/model exception, new Loop,
business write or broader knowledge source was introduced. Fresh final gates and
remaining findings are recorded in implementation-status; historical evidence is
kept separate from this review's executions.

The local M5 checkpoint is complete; stop and await separate explicit Commit/Push
authorization. Any later live annotation acceptance requires its own authorization
and test database. There is currently no need for embedding/vector RAG. Consider document
retrieval only when approved, verifiable public sources cannot be answered through
these stable objects and deterministic services, and document provenance, access,
freshness and external processing have their own reviewed contracts.
