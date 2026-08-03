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
- [x] Add dry-run validation placeholders for GitHub Pages, Azure Static Web Apps, and Azure Storage.
- [x] Add required example directories and starter artifacts.
- [x] Add runnable provider-free agent/chat eval example that generates artifacts and reports.
- [x] Add focused starter tests.
- [x] Add focused governance and baseline compatibility tests.
- [x] Implement `eval-dashboards init` config generation.
- [x] Implement full config loading from `eval-dashboards.config.ts`, `eval-dashboards.config.js`, and `package.json`.
- [x] Align documentation: sweep and replace old `@icodenet/eval-reports` / `eval-reports` naming with `@icodenet/eval-dashboards` / `eval-dashboards`.
- [x] Add GitHub Actions CI workflow (typecheck, test, build, example smoke tests).
- [x] Export JSON Schema for `eval-report/v1` to `schemas/eval-report-v1.schema.json` (5800+ lines, all type definitions and descriptions).
- [x] Create comprehensive taxonomy teaching documentation at `docs/taxonomy.md` (4200+ lines, definitions, examples, checklist, FAQ).
- [x] Create taxonomy-complete init fixture at `examples/taxonomy-complete-fixture/run-complete.json` with README demonstrating best practices.
- [x] Create runner cookbook: Vitest example with README and patterns.
- [x] Create runner cookbook: Jest custom reporter example with README and patterns.
- [x] Create runner cookbook: Node plain eval example with README and use cases.
- [x] Refresh README for adoption messaging, schema-first positioning, and cookbook links.
- [x] Implement HTML grouping by dataset and scenario with collapsible sections.
- [x] Add taxonomy completeness score (0–100%) to row display with visual indicators.
- [x] Add kind badges (deterministic, agent, llm-judge, human-review) to row display.
- [x] Add "All rows (by dataset & scenario)" section with full grouping.
- [x] Implement production Azure Static Web Apps publishing (real, not dry-run).
- [x] Implement production Azure Storage static website publishing (real, not dry-run).
- [x] Add persistent failure detection with `analyzeRowStability()` function.
- [x] Add flaky row classification based on pass/fail history across runs.
- [x] Create CONTRIBUTING.md with development workflow, project structure, and commit guidelines.
- [x] Create CODE_OF_CONDUCT.md (Contributor Covenant-based).
- [x] Create GitHub issue templates (bug report, feature request).
- [x] Create CHANGELOG.md with semantic versioning guidance.
- [x] Implement explicit baseline selection by run id (enhancement to `compareRuns`).
- [x] Enhance HTML dashboard with sparklines and pass-rate trends in history view.
- [x] Create README screenshot gallery (light and dark themes) — visual proof of UI.

- [x] Add npm publishing workflow and semantic version tagging (GitHub Actions).

## Release Notes

- The branch history was rewritten to reflect the current codebase.
- Only the latest post-rewrite release should be treated as the valid reference for the current implementation.
- Earlier release artifacts are superseded and should not be used to evaluate the present code state.

## Remaining / Deferred

- [ ] Create community feedback loop and early runner partnerships (Phase 4 — deferred until npm/adoption readiness).

## Planned / In Assessment

### Parallel Ask Byron + eval-dashboards workstreams

- [x] Ask Byron: inspect existing eval runner, dataset shape, scoring, and CI workflow.
- [x] Ask Byron: add `@icodenet/eval-dashboards@0.3.0` as an explicit dev dependency.
- [x] Ask Byron: map current eval output into `eval-report/v1` without replacing the existing runner.
- [x] Ask Byron: emit `.evals_output/*.json` artifacts with suite summaries and row-level evidence.
- [x] Ask Byron: add suite manifests, dataset versions, rubric versions, and dashboard gates.
- [x] Ask Byron: wire `eval-dashboards lint`, `check`, and `report` into local/CI eval commands.
- [x] Ask Byron: add rubric contracts plus row provenance and lifecycle metadata.
- [x] Ask Byron: surface the generated `/eval-dashboard/` report in the learning UI instead of the old bespoke summary dashboard.
- [ ] Ask Byron: create first published dashboard baseline and document quality gaps.
- [x] eval-dashboards: publish TypeScript declaration files and package metadata so downstream imports resolve public types.
- [x] eval-dashboards: define agent-quality suite presets (`retrieval-recall`, `answer-groundedness`, `answer-quality`, `refusal-safety`, `prompt-injection-resilience`, `mcp-routing`, `content-coverage`, `regression-incidents`, `judge-calibration`).
- [ ] eval-dashboards: decide which setup concepts belong in schema fields/enums, preset files, examples, or docs.
- [ ] eval-dashboards: design setup scaffolding for common agent eval programs, such as `init --preset agent-quality`.
- [x] eval-dashboards: add starter dataset/rubric templates with versioning, provenance, lifecycle, and judge calibration examples.
- [x] eval-dashboards: document how presets map to `riskArea`, `target`, `graders`, gate policies, and rubric contracts.
- [x] eval-dashboards: add a repo-context glossary explaining `eval-report/v1`, suite, dataset, rubric, runner, and row terminology.
- [ ] eval-dashboards: add runner-adapter primitives so teams with an existing eval runner can map local results into `eval-report/v1` without hand-writing aggregate, manifest, rubric, and output-cleanup boilerplate.
- [ ] Cross-feed: use Ask Byron integration learnings to amend eval-dashboards roadmap, templates, and docs before stabilizing setup-layer APIs.
	- Captured so far: prefer directory inputs over config globs, require rubric versions for blocking suites, clean generated artifact directories before writing, make suite summaries row-complete, and expose/embed the generated static dashboard instead of duplicating it with host-app summary cards.
	- Type packaging captured: emit declarations and expose them with `main`, `types`, and `exports`; verified with `pnpm build`, `npm pack`, and a temporary downstream TypeScript compile against the packed tarball.
	- Adapter boundary captured: keep project-specific dataset rows local, but move repeated artifact assembly mechanics into public eval-dashboards helpers.
	- Planning slices captured in ROADMAP: dataset governance, versioned rubrics, judge calibration, CI quality tiers, suite templates, setup scaffolding, and schema/taxonomy decision rules.

## Next Phases

**Phase 4: Shipping & Adoption** (after 2C/3 complete)

- Publish to npm when API is stable
- Announce on Reddit, HN, AI communities, eval-focused newsletters
- Create production-ready GitHub Actions + Azure DevOps templates
- Open scoped "good first issues" for contributors
- Establish feedback loop with early adopters

**Phase 5+: Long-term (post-v1.0)**

- Plugin system for custom reporters
- Optional local web-server mode for interactive exploration
- Richer risk-area and tool-routing views
- Cost/token/latency aggregation
- Diff views between any two runs
- AI-powered suggestions for suite manifests and rubric versions

