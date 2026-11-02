# Hosted evaluation platform: requirements and delivery plan

Decision date: 2026-10-31. Status: approved product direction; portable M1 released in 0.11.0; hosted service pending.

The owner explicitly selected **a fully hosted platform with accounts, ingestion, and live dashboards**. This supersedes the earlier hosted-platform exclusion. The portable package, runner independence, additive `eval-report/v1` contract, and offline exports remain product requirements. Assistant-UI work remains parked.

## Free and open-source requirement — 2026-10-31

The owner reaffirmed that the package must be open source and free. Preserve
its MIT license, offline use, and a complete self-hosted path without mandatory
paid cloud services. Managed databases or hosting may be optional deployment
choices; their compute, storage, and operating costs are separate from the
software being free. A public hosted service needs an explicit funding and
capacity plan rather than a promise of unlimited free infrastructure.

ClickHouse is a candidate **optional analytics backend**, not a replacement for
transactional account, permission, ingestion-job, and review records. Start with
PostgreSQL for the hosted system of record and retain file/SQLite operation for
the portable package. Add a self-hosted ClickHouse adapter only when measured
analytical workloads justify the extra service; do not require ClickHouse Cloud.
This records a candidate, not an implemented adapter or a final database switch.

Verified sources: [ClickHouse Apache-2.0 license](https://github.com/ClickHouse/ClickHouse/blob/master/LICENSE),
[Cloud pricing](https://clickhouse.com/pricing) (paid usage with a time-limited trial),
and [analytical versus transactional workloads](https://clickhouse.com/docs/concepts/features/operations/insert/inserting-data).

## What the repository already provides

This is an extension of a substantial reporting core, not a new evaluation harness. The audit baseline is main commit `bb15899cd10ee945936b6125b452f6d7564ddfe7`.

- `src/model/eval-report-v1.ts` already models versioned suites, judge evidence, human reviews, usage, model metadata, experiment labels, and configuration snapshots.
- `src/reporters/render.ts` already provides detailed single-run evidence, usage totals, latency percentiles, and row-level quality/cost/latency frontiers. These frontiers are not experiment-level comparisons and do not establish comparable score scales across suites.
- `src/history/history.ts` compares stable row identities and pass/fail transitions. It does not detect every score regression within the same pass band. New failing cases must be distinguished from regressions on matched cases.
- `src/history/baseline-compatibility.ts` checks dataset/rubric drift; missing metadata must remain unknown. `src/gates/statistical.ts` provides bootstrap pass-rate comparisons, but paired cases and repeated trials need explicit comparison semantics.
- `src/history/query.ts` supports date, branch, and suite filtering in memory. `src/history/sqlite-store.ts` reads aggregate entries and replaces the full history; it is not a hosted analytical fact store.
- Existing taxonomy lint, review/adjudication, redaction, and static publishing remain useful. They do not provide hosted identity, tenant authorization, reliable ingestion, or live delivery.

## Required offerings

### Decision-oriented overview and single-run investigation

Show the actual configured gate result, blocking segments, change from a compatible baseline, sample counts, uncertainty, and links to representative evidence. A missing gate evaluation must be neutral, not implied approval. Current HTML presentation thresholds are separate from the check command's gate verdict; unify these through a shared decision model. Preserve matched-expectation semantics for intentional negative tests.

Provide authenticated run detail with suite governance, judge reasoning, tool traces, human assessments, and execution errors. Rank the failure feed by severity, new/persistent status, frequency, and affected segment. Support saved slices, reviewer assignment, annotations, and refinement of domain-specific failure categories. An overall average must not hide a critical segment failure.

### Experiment groups and longitudinal analysis

Compare immutable dataset, rubric, scorer, model, prompt, and application versions. Show matched-case coverage, introduced/removed cases, score changes, and repeated-trial uncertainty. Separate incompatible cohorts rather than silently combining them. Support run-to-run investigation and group-level trends.

Add variant-level quality-versus-latency scatter plots with cost as bubble size, distributions, and time series. Specify metric units, score direction, aggregation, eligible cohort, counts, and missing-data coverage. A row-level Pareto frontier is useful evidence but is not a substitute for comparable variant aggregates.

Distinguish taxonomy completeness, telemetry coverage, dataset coverage, and production traffic coverage. The latter two require explicit population/sampling denominators; do not infer them from the submitted rows.

### Accounts, ingestion, and live operation

Provide organizations/projects, invitations, roles, scoped API credentials, audit records, and isolation throughout APIs, workers, storage, caches, events, and exports. Accept portable artifacts from external runners; do not require a particular model provider or introduce a new runner.

Ingestion needs validation, upload limits, content digests, idempotency, immutable revisions, durable job states, retries, and observable failures. Processing state and evaluation quality are distinct. Live progress needs a separate versioned event contract, resumable SSE, and safe handling of duplicate/reordered delivery. A completed artifact remains the portable source of truth.

## Architecture and corrections to the supplied backend sketch

Keep the current library/CLI as the portable core. Add an authenticated web application (Next.js is a candidate), a bounded query/API layer, and independently running ingestion workers. Keep long jobs out of request handlers. Share framework-independent metric and decision semantics between API responses and offline reporters. The Astro documentation site remains documentation.

Use PostgreSQL for tenant/project metadata and typed analytical facts; private object storage for original artifacts and evidence; and a durable queue with transactional outbox/event handling. The worker indexes externally generated artifacts. At-least-once delivery plus idempotent writes is the requirement; do not promise exactly-once processing.

Model organizations/projects, immutable dataset versions and stable cases, suites/rubrics/scorers and versions, experiments/variants, runs/configuration snapshots, case attempts, scorer assessments, usage observations, artifact references, reviews, and audit records. One run may contain multiple suites, datasets, models, graders, and trials. Use tenant-scoped external identifiers plus artifact digests; conflicting payloads for one run require an explicit revision policy.

Specific corrections:

- Counting non-null error messages measures execution errors, not quality failures. Store execution status separately from pass/fail/skipped/unknown quality outcomes.
- Missing cost, tokens, latency, or score is unknown, never an automatic zero. Expose measured counts and denominators for every aggregate.
- Store usage once per generation/actor/scope so multiple scorer assessments cannot multiply cost. Expected output, output on an execution error, and model temperature are not universally required.
- Preserve stable case identity and dataset/rubric/scorer versions. Random database IDs alone cannot support valid cross-run matching.
- Use JSONB for extensible evidence, with typed metric definitions/facts for frequently queried measures, units, direction, and eligibility. Choose expression/composite indexes using actual queries and EXPLAIN; a generic JSONB index does not solve every numeric aggregation.
- Bound APIs with cursor pagination, filtered aggregates, and explicitly labeled plot sampling. Do not send every evaluation item to a chart endpoint.
- Use incremental completion rollups and expose freshness. Introduce partitions/materialized views after workload benchmarks justify them, with retention and uniqueness constraints designed together.
- If Next.js is selected, use its current asynchronous route-parameter contract rather than copying obsolete handler signatures from the sketch.

## Ordered delivery and acceptance criteria

Portable M1 meets the acceptance criteria and was published as 0.11.0 on 2026-11-02, with code/tests below and [publication evidence](./reviews/2026-11-02-release-0.11.0.json). M2–M6 remain open; no hosted deployment is claimed.

1. **M1 — Shared analytics and decision semantics.** Define actual verdict states, compatible cohorts, paired/repeated comparisons, metric units/direction, missing-data rules, and denominators. The same fixture must produce the same decisions in JSON, HTML, and the future API. Cover critical segment failures, intentional negative cases, incompatible baselines, and unknown telemetry.
2. **M2 — Tenant-safe ingestion vertical slice.** Implement accounts/org/project roles and scoped API keys; validated artifact upload; PostgreSQL/private blob persistence; durable jobs; idempotent indexing. Prove cross-tenant isolation, duplicate delivery safety, explicit revision handling, and that invalid/partial uploads cannot become completed runs.
3. **M3 — Hosted decision workflow.** Deliver an overview brief, run evidence, experiment comparison, ranked failure feed, and review workflow through bounded APIs. An engineer must locate the blocking segment and its evidence; a stakeholder must understand what changed and the next action.
4. **M4 — Trade-offs, distributions, and coverage.** Add comparable variant bubble plots, histograms, uncertainty, version filters, and population-aware coverage. Refuse incompatible aggregation and distinguish unknown values from zero.
5. **M5 — Live progress and measured scale.** Add durable resumable events, retry/backpressure, incremental rollups, query pushdown, pagination, and realistic workload benchmarks. Verify reconnect/duplicate/reordered events and bounded query/memory behavior. Set numerical budgets from measurements, not invented throughput promises.
6. **M6 — Hosted launch gate (required before launch).** Test authorization across all paths, redaction, audit, deletion/retention, portable exports, migration rollback, backup restoration, service observability, quotas, and accessibility. Use sanitized fixtures and provider-free CI. Hosting vendor, authentication provider, operating budget, and deployment approval remain launch decisions.

M1 portable semantics are implemented: the first slice shares configured CLI gate evaluation and reports its decision across outputs (see [gate decisions](./gates.md#reported-gate-decisions)). M1 now also has descriptive matched-cohort and measured-telemetry analytics; paired group bounds and inconclusive decisions are available through the opt-in paired gate; within-case trial bounds now require explicit sampling declarations; the reusable complete policy evaluator merged in #103 with CLI/public parity coverage. M2 is the first complete hosted vertical slice. Existing portable integrations remain supported. No hosted service feature is marked shipped by this document; no hosted platform deployment is claimed.

## Sources and interpretation

The supplied material informs requirements, not proof that the proposed schema is production-ready.

- [Scale evaluation dashboards](https://scalegp.mintlify.app/docs/v5/evaluation-dashboards/overview) supports distinct single-run and evaluation-group views.
- [Hamel/Shreya dashboard guidance](https://hamel.dev/blog/posts/evals-faq/what-does-a-good-eval-dashboard-look-like.html) motivates a narrative of changes, likely causes, and actions rather than leaving interpretation to the reader. The precise claim that 20–50 manual reviews are required was not verified from this page.
- [Metabase quality tracking](https://www.metabase.com/dashboards/eval-quality-tracking) motivates version-aware trends and links to underlying evidence.
- [PostgreSQL JSON indexing](https://www.postgresql.org/docs/current/datatype-json.html#JSON-INDEXING) and [partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) inform workload-specific storage decisions.
- [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) documents the current route parameter contract.

The eval.qa source could not be verified. Repository gaps and the delivery sequence above are our analysis, not claims attributed to those sources.

The dated slice records below describe their state at the time. The final
portable M1 acceptance record at the end supersedes their earlier open items.

## Initial M1 verification record — 2026-10-31

The initial slice shares the configured CLI evaluation path between `check`
and `report`, exposes an additive `gateDecision`, and removes fixed pass-rate
approval colors. `eval-report/v1` is unchanged. M1 remains open for the
additional semantics listed above; the hosted service is not implemented.

Verified locally:

- `pnpm check`: passed, including 794 Vitest tests, typecheck, build, teaching output verification, flag documentation, and nine commit-hook tests.
- `pnpm assets:regenerate` followed by `pnpm assets:verify`: passed; 18 tracked release assets reproduce. Report HTML/JSON and the light/dark screenshots have expected changes for the decision banner.
- `pnpm artifacts:report-power`: passed; regenerated the example report and both gate outputs. The strict policy intentionally exits 1 and the script verifies that failure.
- `node docs-site/scripts/check-site.mjs docs-site/dist`: passed with 89 documentation pages; the new requirements page is linked from the sidebar and docs index.
- `git diff --check`: passed.
- Visually inspected the regenerated light report: the decision banner is readable, pass rate is neutral, and baseline warnings remain visible.

Parity tests include critical failures despite a 95% pass rate, stricter suite
thresholds, expected negative cases, waivers, threshold loosening, calibration,
and blocked baselines. Programmatic reports without evaluation remain neutral;
untrusted failure and diagnostic evidence is escaped in HTML. Report creation
continues to succeed when gates fail; CI enforcement stays with `check`.

The VHS scratch installation was moved to `.tmp/vhs-demo` and its tape updated,
so recording dependencies no longer become documentation pages. Generated GIF
and MP4 files remain local ignored outputs. No workflow or cloud deployment was
changed, so workflow-specific raw Actions log verification is not applicable to
this change. The commit evidence gate separately records its required checks
against the exact staged tree.

## M1 cohort and measured-telemetry slice — 2026-10-31

The portable analytics API now separates introduced/removed cases from matched
outcome changes, checks measurement-version eligibility, and detects score
changes within passing bands using explicit scale/direction metadata. Optional
`graderVersion` and `scoreDirection` fields, runtime validation, JSON Schema,
and the taxonomy-complete fixture move together without breaking v1 artifacts.
Cost/token/latency coverage has separate measured denominators and keeps absent
values unknown. Population coverage is not inferred from submitted rows.

Validation before commit: `pnpm check` passed with 814 tests plus typecheck,
build, teaching/flag checks and hook tests; `pnpm assets:regenerate` and
`pnpm assets:verify` reproduced all 18 tracked release assets;
`pnpm artifacts:report-power` regenerated the runnable examples; the built docs
link check passed. The reading exercise was replayed and its actual generated
summary copied into the teaching text. No workflow was changed. M1 remains open
for paired/repeated uncertainty and explicit inconclusive gate semantics.

## M1 paired-comparison slice — 2026-10-31

The optional paired policy compares matching, version-compatible case groups
and reports passed, failed, or inconclusive. It requires a declared independence
assumption, does not inflate sample size from mirrored scenario rows or repeat
counts, and keeps waivers out of observed statistical evidence. Existing
bootstrap and point-gate defaults are unchanged. Trial-level evidence and
uncertainty remain open, so the whole M1 milestone is not marked complete.

The recorded before/after example is `docs/reviews/2026-10-31-paired-comparison.json`.
It explicitly records different policy settings for the same 100 passing cases:
the existing bootstrap policy passes with a zero-width sampled interval; the
new opted-in conservative paired policy is inconclusive with a nonzero bound.
Both report commands write their outputs successfully. This is a behavior
comparison, not a performance benchmark. The example generator is provider-free
and the offline screenshot is regenerated with release assets.

Validation uses the full repository check, focused paired/waiver/config tests,
live CLI help snapshots, documentation links, example replay, package and CLI
guards, and release-asset reproduction through the exact-tree commit gate.
The release-asset generation script is exercised by CI; its raw job output is
reviewed after the PR run rather than inferred from a green badge.


The paired slice also removes the `main`-only pull-request filter from CI and
the composite-action smoke test. Push triggers remain restricted to `main`,
and token permissions remain read-only. PR #97's observed checks exposed the
problem: only title/review checks ran when its base was a feature branch. The
paired PR's actual Actions run is used to verify that the full jobs now execute.


## M1 repeated-trial slice — 2026-11-01

Optional artifact sampling declarations support conservative within-case trial
bounds and matching-case rate differences. Unknown sampling stays unknown;
trial counts do not change the paired gate's independent case-group count.
This slice shares calculations across JSON, HTML, Markdown, and text and retains
ordinary gate behavior. M1 remains open for acceptance review of the reusable full policy evaluator
needed by future hosted APIs; no hosted API is implemented by this slice.

PR #99's raw logs were reviewed at `b6ff65c`: CI ran 846 tests, 111 CLI guards,
schema/package checks, report reproduction, accessibility, teaching, and docs
checks. The composite-action test generated reports and verified its expected
failing gate path; examples passed. Its Node 20 package installation emitted a
transitive `content-type` Node >=22 engine warning, which remains a compatibility
follow-up. Audit results were 2 low and 7 moderate findings, below the configured
high-severity failure threshold. See PR #99's linked job logs.

## M1 reusable policy slice — 2026-11-01

`evaluateReportPolicy` extracts complete evaluation from the CLI. It consumes
validated selected artifacts and resolved policy, then returns the shared
verdict plus waiver, calibration, threshold-change and tier-budget evidence.
CLI `check` and `report` call it; public-API parity tests cover critical failures,
expected negatives, blocking baseline drift, waivers, calibration, threshold
loosening and tier budgets. Paired decisions continue to use raw observations.

The caller must validate inputs, select runs and tiers, and scope calibration
evidence to the same project and authorized tenant. No hosted endpoint, account
or ingestion service is claimed. The slice merged in [#103](https://github.com/IcodeNet/eval-dashboards/pull/103), with 911 tests and packed-consumer checks verified
in raw CI logs. CodeRabbit skipped due to its free allowance; no completed
external review is claimed. The final acceptance tests below complete portable M1; the hosted endpoint remains M2.

## Portable M1 acceptance — 2026-11-01

The 0.11.0 candidate covers actual decision states and critical segment failures
(`test/gate-decision.test.ts`), matching-case versions, score direction and
measured/missing denominators (`test/run-analytics.test.ts`), conservative paired
group bounds (`test/paired-comparison.test.ts`) and within-case trial uncertainty
with unknown sampling preserved (`test/repeated-trials.test.ts`).

Public complete policy, CLI check and reporters share the same evaluation.
`test/evaluate-policy.test.ts` additionally checks passed/failed/inconclusive
public decisions across JSON, HTML, Markdown and text using a non-default 80%
comparison confidence level. The descriptive evidence and decision retain the
same configured comparison. `test/cli-pr-tiering.test.ts` checks budget parity.

This satisfies M1's reusable library semantics. It does not implement the future
HTTP API, tenant isolation, accounts or ingestion. Those remain M2 and later.
Package publication stays held until release checks, review, merge verification
and explicit owner approval of the exact candidate revision.

## M2 storage foundation — 2026-11-01

The first M2 slice is [source-only PostgreSQL metadata and integration checks](../hosted/postgres/README.md).
It keeps tenant/project IDs in parent/child keys, scopes application reads and
writes under trusted transaction context, and models immutable artifacts,
idempotency associations and durable job metadata. One artifact can contain
many datasets, models, suites and graders; no single-model/dataset restriction
is added to `eval-report/v1`. Processing completion may carry a failed quality
decision. Analytical facts and blob persistence are not implemented here.

Real PostgreSQL tests include a conventional UUID-only foreign-key control that
accepts a mismatched tenant/project, while the scoped schema rejects the same
IDs. They also check restricted runtime privileges, permissive default grants,
project scope, immutable revisions, exact-digest idempotency references and
lease/completion metadata. This is functional evidence, not a scale benchmark.

Row-policy context is not authentication: future service code must derive it
from verified identity/credentials and permissions. Database access remains
inside the trusted service; superusers and BYPASSRLS users are outside these
row policies. HTTP authorization, credential issuance, bounded intake with core
validation, private blobs, atomic jobs, replay/conflict handling, and worker
protocols remain required before M2 is complete. PostgreSQL stays optional for
the portable package; ClickHouse remains a later measured analytics candidate.

### M2 credential lookup foundation — 2026-11-02

Source adds `hosted/postgres/migrations/002-api-credentials.sql`: project-bound
API secret digests, finite expiry/revocation, and a restricted lookup function
that intersects key scopes with current membership. Real PostgreSQL checks in
`scripts/hosted-db.test.mjs` cover cross-tenant references, denied direct access,
forged scope settings, membership downgrade/removal, expiry and search-path
substitution. See the [credential guide](../hosted/postgres/README.md#project-scoped-credential-lookup--source-only).

This is database authorization groundwork. The later bearer-header slice below
adds secret generation/parsing and local operation checks. HTTP route integration,
account sign-in, credential management/audit, validated uploads, private blobs
and workers remain open. M2 is incomplete. The portable contract and database-free package behavior are unchanged.

### M2 bearer-header helper — 2026-11-02

Private source in `hosted/auth/api-credentials.ts` generates 32-byte random,
versioned API secrets and authenticates a parsed bearer header through the
stored credential lookup. The requested project and server-selected operation
must match stored permissions. Malformed headers skip lookup; backend failures
and malformed results deny access. Returned context copies only stored fields.
Tests cover header/encoding errors, scope/project denial, repeated lookup after
revocation, and secret-free errors (`test/hosted-api-credentials.test.ts`).
The actual PostgreSQL harness also authenticates a generated secret and checks
project denial, membership downgrade and revocation (`scripts/hosted-db.test.mjs`).

See [the runnable example and integration limits](../hosted/auth/README.md).
There is no HTTP endpoint or persistent issuer. Raw-header duplicate detection,
route integration, browser sign-in, issuance/rotation/audit, uploads and workers
remain open. M2 is incomplete; the portable package remains database-free.


### M2 authenticated artifact intake — 2026-11-02

[Private intake source](../hosted/ingestion/README.md) connects the stored
credential lookup to bounded HTTP uploads, the existing `eval-report/v1`
validator, durable private files and transactional PostgreSQL artifact/key/job
acceptance. Migration 003 preserves invoker permissions and row policies.
Exact retries return the same job; changed run revisions require a new key and
explicit revision. Real HTTP/database checks verify queued receipts, conflicts,
revocation, concurrent delivery and rollback; quality failures remain distinct
from indexing state. Original bytes remain the portable source of truth.

This implements the intake path as composable service source, with no database
driver or hosted deployment added to the npm package. Accounts, persistent key
issuance, service wiring, worker claiming/indexing/retries, retention and launch
controls remain open. Orphan private files can remain after an interrupted or
conflicting database write; coordinated cleanup is still required. M2 is not
complete and no throughput benchmark or production launch is claimed.


### M2 worker coordination — 2026-11-02

[Migration 004](../hosted/workers/README.md) adds scoped concurrent claims,
lease renewal, delayed bounded retries and current-token settlement. Real
database checks verify lock skipping and reject stale/expired completion even
inside an old transaction. Completed processing may still carry failed eval
quality. A crashed final attempt is retired rather than endlessly reclaimed.

This coordinates trusted workers; the SQL login can still perform direct
writes and must use the protocol. The next artifact-indexing slice must make
fact writes and completion one fenced transaction. No indexing worker,
process scheduler, account service or hosted deployment is claimed. M2 remains
open, and the portable package stays offline and database-free.
