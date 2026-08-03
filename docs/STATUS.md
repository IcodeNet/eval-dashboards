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

