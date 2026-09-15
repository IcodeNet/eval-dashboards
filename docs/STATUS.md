# Implementation Status

Update this file as features are implemented. Keep it honest: mark an item done only after the relevant code and tests exist.

See also: [ROADMAP.md](./ROADMAP.md) for the prioritized improvement plan.

## Done

- [x] Create independent project directory.
- [x] Add npm package metadata for `@icodenet/eval-dashboards`.
- [x] Add TypeScript, tsup, and Vitest project skeleton.
- [x] Add CLI binary entry point (`eval-dashboards`).
- [x] Add PRP documentation.
- [x] Add versioned `eval-report/v1` model and validation.
- [x] Add first-class optional agent and LLM judge report fields.
- [x] Add portable suite manifest, gate policy, and rubric contract fields.
- [x] Add baseline compatibility assessment for dataset and rubric version drift.
- [x] Add basic report discovery and history building.
- [x] Add latest-vs-previous comparison.
- [x] Add initial gate checking.
- [x] Add starter `text`, `json-summary`, `markdown-summary`, and `html` reporters.
- [x] Add local directory publish target.
- [x] Implement publishing adapters for GitHub Pages and Azure Storage, plus Azure Static Web Apps dry-run validation mode.
- [x] Add required example directories and starter artifacts.
- [x] Add runnable provider-free agent/chat eval example that generates artifacts and reports.
- [x] Add focused starter tests.
- [x] Add focused governance and baseline compatibility tests.
- [x] Implement `eval-dashboards init` config generation.
- [x] Implement full config loading from `eval-dashboards.config.ts`, `eval-dashboards.config.js`, and `package.json`.
- [x] Align documentation: sweep and replace old `@icodenet/eval-reports` / `eval-reports` naming with `@icodenet/eval-dashboards` / `eval-dashboards`.
- [x] Add GitHub Actions CI workflow (typecheck, test, build, example smoke tests).
- [x] Export JSON Schema for `eval-report/v1` to `schemas/eval-report-v1.schema.json` (published and maintained in-repo).
- [x] Create comprehensive taxonomy teaching documentation at `docs/taxonomy.md` (definitions, examples, checklist, FAQ).
- [x] Create taxonomy-complete init fixture at `examples/taxonomy-complete-fixture/run-complete.json` with README demonstrating best practices.
- [x] Create runner cookbook: Vitest example with README and patterns.
- [x] Create runner cookbook: Jest custom reporter example with README and patterns.
- [x] Create runner cookbook: Node plain eval example with README and use cases.
- [x] Refresh README for adoption messaging, schema-first positioning, and cookbook links.
- [x] Implement HTML grouping by dataset and scenario with collapsible sections.
- [x] Add taxonomy completeness score (0–100%) to row display with visual indicators.
- [x] Add kind badges (deterministic, agent, llm-judge, human-review) to row display.
- [x] Add "All rows (by dataset & scenario)" section with full grouping.
- [x] Implement Azure Static Web Apps dry-run validation path (non-dry-run execution path pending).
- [x] Implement Azure Storage static website publishing adapter (including dry-run validation path).
- [x] Add persistent failure detection with `analyzeRowStability()` function.
- [x] Add flaky row classification based on pass/fail history across runs.
- [x] Create CONTRIBUTING.md with development workflow, project structure, and commit guidelines.
- [x] Create CODE_OF_CONDUCT.md (Contributor Covenant-based).
- [x] Create GitHub issue templates (bug report, feature request).
- [x] Create CHANGELOG.md with semantic versioning guidance.
- [x] Implement explicit baseline selection by run id (enhancement to `compareRuns`).
- [x] Enhance HTML dashboard with sparklines and pass-rate trends in history view.
- [x] Create README screenshot gallery (light and dark themes) — visual proof of UI.
- [x] Add concrete report-power artifact fixture with tracked history/progress/gate/detail outputs and deterministic regeneration script.
- [x] Add teach delivery-stage labs plus FDE role workflow guidance grounded in report artifacts and required evidence outputs.

- [x] Add npm publishing workflow and semantic version tagging (GitHub Actions).

## Release Notes

- The branch history was rewritten to reflect the current codebase.
- Only the latest post-rewrite release should be treated as the valid reference for the current implementation.
- Earlier release artifacts are superseded and should not be used to evaluate the present code state.

## Ongoing (live KPIs)

- [x] Create community feedback loop infrastructure and early-runner outreach tracker (Phase 4 readiness).
	- Added weekly metrics loop via `pnpm metrics:adoption` and snapshot output in `docs/adoption-metrics/latest.json`.
	- Added manual signal tracker at `docs/adoption-metrics/manual-signals.json`.
	- Added partnership log and outreach stages in `docs/community-partnership-log.md`.
	- External adoption outcomes continue as live KPIs, not static checklist items.

## Planned / In Assessment

### Parallel reference integration + eval-dashboards workstreams

- [x] reference integration: inspect existing eval runner, dataset shape, scoring, and CI workflow.
- [x] reference integration: add `@icodenet/eval-dashboards@0.3.0` as an explicit dev dependency.
- [x] reference integration: map current eval output into `eval-report/v1` without replacing the existing runner.
- [x] reference integration: emit `.evals_output/*.json` artifacts with suite summaries and row-level evidence.
- [x] reference integration: add suite manifests, dataset versions, rubric versions, and dashboard gates.
- [x] reference integration: wire `eval-dashboards lint`, `check`, and `report` into local/CI eval commands.
- [x] reference integration: add rubric contracts plus row provenance and lifecycle metadata.
- [x] reference integration: surface the generated `/eval-dashboard/` report in the learning UI instead of the old bespoke summary dashboard.
- [x] reference integration: create first published dashboard baseline and document quality gaps.
- [x] eval-dashboards: publish TypeScript declaration files and package metadata so downstream imports resolve public types.
- [x] eval-dashboards: define agent-quality suite presets (`retrieval-recall`, `answer-groundedness`, `answer-quality`, `refusal-safety`, `prompt-injection-resilience`, `mcp-routing`, `content-coverage`, `regression-incidents`, `judge-calibration`).
- [x] eval-dashboards: decide which setup concepts belong in schema fields/enums, preset files, examples, or docs.
- [x] eval-dashboards: design setup scaffolding for common agent eval programs, such as `init --preset agent-quality`.
- [x] eval-dashboards: add starter dataset/rubric templates with versioning, provenance, lifecycle, and judge calibration examples.
- [x] eval-dashboards: document how presets map to `riskArea`, `target`, `graders`, gate policies, and rubric contracts.
- [x] eval-dashboards: add a repo-context glossary explaining `eval-report/v1`, suite, dataset, rubric, runner, and row terminology.
- [x] eval-dashboards: add runner-adapter primitives so teams with an existing eval runner can map local results into `eval-report/v1` without hand-writing aggregate, manifest, rubric, and output-cleanup boilerplate.
- [x] Cross-feed: use reference integration learnings to amend eval-dashboards roadmap, templates, and docs before stabilizing setup-layer APIs.
	- Captured so far: prefer directory inputs over config globs, require rubric versions for blocking suites, clean generated artifact directories before writing, make suite summaries row-complete, and expose/embed the generated static dashboard instead of duplicating it with host-app summary cards.
	- Type packaging captured: emit declarations and expose them with `main`, `types`, and `exports`; verified with `pnpm build`, `npm pack`, and a temporary downstream TypeScript compile against the packed tarball.
	- Adapter boundary captured: keep project-specific dataset rows local, but move repeated artifact assembly mechanics into public eval-dashboards helpers.
	- Approval-gate pattern captured: document `eval-results` branch layout, `pr-meta.json` wiring, commit-status contract (`eval/quality-gate`), environment approval flow, and cleanup workflow templates for closed PRs.
	- Planning slices captured in ROADMAP: dataset governance, versioned rubrics, judge calibration, CI quality tiers, suite templates, setup scaffolding, and schema/taxonomy decision rules.

- [x] Research and publish industry coverage audit for suites/datasets/rubrics.
	- Added [docs/industry-coverage-audit.md](./industry-coverage-audit.md) with external-source mapping and local coverage matrix.
	- Identified P0 additions: `goal-success`, `intent-resolution`, `task-adherence`, `sensitive-disclosure`, and `agency-boundary` presets.

- [x] Implement P0 industry coverage suites in presets, dataset templates, rubrics, artifact template, and init scaffold.
	- Scope tracked in [docs/industry-coverage-audit.md](./industry-coverage-audit.md).
	- Must include parity updates across docs + examples + `src/cli/init-scaffold.ts`.
	- Added starter multi-turn trajectory coverage (`multiturn-trajectory`) with preset guidance, dataset case, rubric axes, template artifact row, and scaffold output.

## Next Phases

### Phase 4B setup automation checklist (complete)

- [x] 4B.1 Expand existing `init` with composable setup/runner/ci flags while preserving current behavior.
- [x] 4B.2 Generate checked-in local-agent setup playbook output with verify-before-merge command block.
- [x] 4B.3 Add `import` command adapters (Promptfoo, DeepEval, AgentEvals first) reusing adapter helper normalization.
- [x] 4B.6 Add optional portable trace-reference fields and reporter links (additive schema extension).
- [x] 4B.5 Add guardrail-focused report profile aligned to industry-audit safety taxonomy.
- [x] 4B.4 Add optional statistical gating mode after stable identity/sample-size prerequisites.
- [x] 4B.7 Add human adjudication export/import package flow.
- [x] 4B.8 Add cost-quality frontier and benchmark-pack templates.

### Phase 4C docs-site adoption checklist (complete)

- [x] 4C.1 Stand up static product docs site on GitHub Pages.
- [x] 4C.2 Publish CLI-first onboarding flow centered on `init` + local-agent setup prompts.
- [x] 4C.3 Publish interoperability guides (Promptfoo, DeepEval, OpenEvals/AgentEvals, trace stacks).
- [x] 4C.4 Add assistant-ui reference integration case study with reproducible commands.
- [x] 4C.5 Add docs-adoption measurement loop and friction backlog.
- [x] 4C.6 Run docs truth-sync sweep across README/ROADMAP/STATUS/help/publishing/examples.
- [x] 4C.7 Expand interoperability docs for supplementary eval toolchains and operations stack guidance.
- [x] 4C.8 Add integration risk register (runtime/version drift, sidecar dependencies, schema drift, cloud coupling, synthetic overfitting).
- [x] 4C.9 Add trace-first evidence hardening guidance and end-to-end example.
- [x] 4C.10 Add adopt-now docs path and candidate existing-runner adoption map (`docs-site/v1/adopt-now.html`, `docs/adoption-map.md`).
- [x] 4C.docs-stack Record and apply docs-site stack decision for current milestone (`docs/docs-site-stack-decision.md`).

### Phase 4D trusted confidence + adoption execution checklist (planned)

- [x] 4D.1 Add schema generation + schema-drift CI guard and remove stale count/completion claims.
- [x] 4D.2 Add prioritized execution backlog for validation hardening, CI-native outputs, metrics path, Python adoption, interop expansion, calibration, and OTel guidance.
- [x] 4D.3 Author the 14-day window (exactly 6 items) with owner/dependency/acceptance criteria tracking.
- [x] 4D.4 Author the 45-day window (exactly 8 items) with owner/dependency/acceptance criteria tracking.
- [x] 4D.5 Add critical/high risk register entries with trigger signals and mitigations.
- [x] 4D.6 Keep README/ROADMAP/STATUS/help/publishing/examples discoverability and claim consistency synchronized.

**Immediate next implementation slices**

- 4E.5 dataset governance hardening is complete: `lint` now warns on duplicate dataset case ids across suites, orphaned `scenarioId` references (without `datasetId`), and low per-category coverage for dataset-governed suites, with strictness controls via `--strict` and `--fail-on-warning-code`.
- CI-native machine output slice is complete: `check --json-out`, `--junit-out`, `--sarif-out`, `--github-annotations-out`, and `--heartbeat-out` emit machine-readable gate outputs, row anchors, and run-status heartbeats for CI monitoring.
- 4E.1 alerting adapters are complete: `check --notify` supports Slack webhook, Teams webhook (adaptive-card payload), and email/SMTP adapters with CLI/env/config precedence plus machine-readable notification diagnostics in `check-result.json`.
- 4E.3 calibration preflight is complete: when `judge-calibration` is configured (or force-enabled with `--calibration-preflight` / `gates.calibration.enabled: true`), `check` enforces independent calibration evidence for blocking judge-scored suites, treats missing `judgeModel` values as blocking failures, warns in report-only mode, matches against the configured calibration-suite rubric contract, validates configurable recency (`--calibration-max-age-hours`), and documents explicit override paths (`--allow-stale-calibration`, `--calibration-preflight`, `--no-calibration-preflight`).
- Breaking behavior changes:
  - blocking suites no longer self-certify against current-run calibration rows; teams that previously relied on same-run evidence must supply an in-window independent calibration report in the input set.
  - calibration preflight now fails fast with exit code `2` when the configured calibration suite metadata omits `rubricVersion` in both suite manifests and rubric contracts.
  - dataset-governance lint checks now add warning volume (`duplicate-dataset-case-id`, `orphan-scenario-reference`, `low-category-coverage`), which can turn existing `lint --strict` and warning-budgeted `check` policies red until fixtures are adjusted or warning budgets are updated.
- Phase 4F (evidence, confidentiality, and org rollout) is in progress. 4F.1 (two-tier artifact split), 4F.2 (redaction profile and publish preflight), 4F.3 (`eval-check-result/v2` provenance) and 4F.4 (artifact digest + detached signature via `sign`/`verify`) shipped previously. 4F.5 (waiver and exception register) shipped: `eval-dashboards check --waiver-file=<path>` (or `waiverFile` in the config file) reads an `eval-waiver-register/v1` JSON file, treats matched/non-expired waivers' rows as passed for gating and reports them prominently as `ACTIVE WAIVER ...` diagnostics plus `waivers.active[]` in `--json-out`/`--json-v2-out`, and always fails the gate for an expired waiver even if the row still fails (`src/gates/waivers.ts`, `src/cli/index.ts`, `test/waivers.test.ts`, `test/cli-check-waivers.test.ts`, `docs/gates.md`). 4F.6 (threshold-change detection) shipped: `eval-dashboards check --baseline-gate-config=<path>` (or `baselineGateConfigFile` in the config file) compares the resolved gate config for this run against a recorded baseline `GateConfig` JSON file and fails the gate on any unapproved loosening of `minPassRate`, `maxNewFailures`, `zeroCritical`, `requiredPassingSuites`, `failOnWarningCodes`, `maxWarningsByCode`, statistical, and calibration thresholds, with an explicit `--allow-gate-loosening` (or `gates.allowLoosening`) escape hatch; every changed field is surfaced in `check --json-out`/`--json-v2-out` as `thresholdChanges[]` regardless of whether the loosening was approved (`src/gates/threshold-change.ts`, `src/cli/index.ts`, `test/threshold-change.test.ts`, `test/cli-check-threshold-change.test.ts`, `docs/gates.md`). 4F.7 (heartbeat verifier) shipped: `eval-dashboards heartbeat-verify --heartbeat=<path> --max-age-hours=<n>` is a scheduled, pipeline-independent check that fails closed (exit 1) when a release's `eval-check-heartbeat/v1` file is missing, malformed, stale beyond the window, or reports `gateRunStatus` of `skipped`/`errored` — turning a deleted/skipped gate step into an alert instead of silent success (`src/gates/heartbeat.ts`, `src/cli/index.ts`, `test/heartbeat-verify.test.ts`, `docs/gates.md`). 4F.8 (static org rollup index) shipped: `eval-dashboards org-rollup --input=<dir> --out=<path>` recursively finds already-published per-repo `history.json` files (the same file `history`/`report --reporter=html` write) under a local directory and renders one static, offline HTML page ranking repos by regression status (pass-rate drop, new critical failures, new failures), with pass-rate delta, critical/new/persistent failure counts, run count, and last-run date per repo — no ingestion API, no auth, no server, and no cross-repo network calls; it only reads local files a human or existing CI publish step copies into place (`src/history/org-rollup.ts`, `src/reporters/org-rollup.ts`, `src/cli/index.ts`, `test/org-rollup.test.ts`, `test/cli-org-rollup.test.ts`). 4F.9 (bypass accounting) shipped: `check --bypass-log=<path>` and `publish --bypass-log=<path>` (or `bypassLogFile` in the config file) append one `eval-bypass-log-entry/v1` JSON-lines record per invocation naming which of `--allow-blocked-baseline`/`--allow-stale-calibration`/`--allow-gate-loosening`/`--allow-sensitive-publish` were used; `check --json-out`/`--json-v2-out` always includes a `bypassUsage: { flags, used, count }` field so a clean run is a verifiable `count: 0` rather than an absent field; `history --bypass-log=<path>` joins the log by run id into each history entry's `bypassUsage`; `org-rollup` surfaces a per-repo `bypassCount` column and an org-wide `totalBypassCount` summary card, turning gate erosion into a visible trend instead of an audit discovery (`src/gates/bypass-accounting.ts`, `src/history/history.ts`, `src/history/org-rollup.ts`, `src/reporters/org-rollup.ts`, `src/cli/index.ts`, `test/bypass-accounting.test.ts`, `test/cli-bypass-accounting.test.ts`). Remaining: 4F.10-4F.11 (PR-subset tiering, evidence export bundle). See `docs/ROADMAP.md` Phase 4F.
- Roadmap claim audit, 2026-09-14: all 140 completed roadmap items were re-verified against code. Five were downgraded to not-done (external reference-integration dev dependency, host-app report surfacing, example-alignment process claim, docs consistency checklist, interop adapter expansion for Ragas/Langfuse/Phoenix/Braintrust/OpenAI) and twelve were reworded to match what actually shipped. Every corrected item carries an inline `Audit 2026-09-14` note in `docs/ROADMAP.md` explaining the gap. Two corrections matter for adoption claims: coded import adapters exist only for promptfoo, deepeval and agentevals/openevals, and npm publishing is manual `workflow_dispatch` rather than tag-triggered.
- The email notification channel depends on `nodemailer`, which is an `optionalDependency`. `--notify=email` fails at runtime in installs that skip optional dependencies; document this alongside the notify flags.
- Docs-navigability review, 2026-09-15: `docs/` has grown to 94 files (29 top-level) with no index, no audience-based grouping, and two competing "canonical" surfaces (`docs-site/v1/*.html`, 11 curated pages, vs. raw `docs/*.md`). Added Phase 4H (docs/ROADMAP.md) to add a `docs/README.md` index, regroup README's flat Documentation Index, add a `docs/teach-exercises/README.md` matching the existing `teach-labs/README.md` pattern, add a ROADMAP table of contents, and generalize the ad hoc stale-embedded-help-text check into an automated sweep across all docs.

**External Phase 4: Shipping & Adoption**

- Announce on Reddit, HN, AI communities, eval-focused newsletters
- Expand real-world runner partnerships and external integration examples
- Open scoped "good first issues" for contributors
- Continue the feedback loop with early adopters

**Phase 5+: Long-term (post-v1.0)**

- Plugin system for custom reporters
- Optional local web-server mode for interactive exploration
- Richer risk-area and tool-routing views
- Cost/token/latency aggregation
- Diff views between any two runs
- AI-powered suggestions for suite manifests and rubric versions

