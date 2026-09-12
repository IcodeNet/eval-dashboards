# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** While in 0.x, breaking changes may occur with minor version bumps as the public API stabilizes.

---

## [Unreleased]

### Added

- Cost/latency-quality frontier sections in markdown/html reports when row-level `score` plus `durationMs`/cost metadata are present.
- Benchmark-pack templates for safety, tool-routing, and groundedness under `examples/benchmark-packs/` with compatibility guidance.
- Docs-site assistant-ui reference integration page with reproducible lint/check/report/publish command flow.

### Changed

- Benchmark pack fixtures now use valid `datasetSource` enum values and suite-manifest thresholds aligned with implemented gate semantics.
- Pack compatibility test now validates templates through `validateEvalReport` using `suiteManifests`, not string-shape checks only.
- Pack JSON templates are now included in npm package `files` for downstream consumers.

### Fixed

- Frontier markdown table rendering now escapes `|` and newline cell content.
- Frontier extraction now treats `score` and `durationMs` as strict numeric fields (no coercion of `null`/string to `0`).

---

## [0.7.0] — 2026-09-03

### Added

- `EvalRow.expectedOutcome: 'pass' | 'fail'` — lets a row declare that failing is its expected/correct outcome (e.g. an A/B harness's baseline row, which should reproduce a mistake as proof the case tests something). Matches the `xfail`/expected-failure convention from pytest/JUnit rather than a bespoke category string. Rows without it default to "expected to pass", same as `passed` behaves today — fully backward-compatible.
- `rowMatchedExpectation()` helper (exported from the package root) — whether a row's actual outcome matched its declared `expectedOutcome`.
- `EvalSummary.matchedExpectation` / `expectationMismatches` / `matchedExpectationRate` — alongside the existing `passed` / `passRate`, for suites that mix expected-fail and expected-pass rows where a flat pass rate is misleading.
- `expectation-mismatch` lint warning when a row's actual outcome disagrees with its declared `expectedOutcome`.
- `minMatchedExpectationRate` gate config option and matching `--min-matched-expectation-rate` CLI flag, as the correct alternative to `minPassRate` for A/B-shaped suites.
- `RunnerEvalCaseResult` (the input type for `writeEvalReportArtifact`/`createEvalReportArtifact`) now accepts `kind`, `datasetId`, `scenarioId`, `rubricId`, `judgeModel`/`judgeVerdict`/`judgeCategory`/`judgeReasoning`, `promptVersion`, `agentChannel`, `agentVersion` directly — `createDefaultRow` copies them through without requiring the `mapRow` escape hatch.

### Fixed

- Real-world adoption case study (`docs/case-studies/assistant-ui/README.md`, running this package against `assistant-ui/assistant-ui`'s own eval harness) surfaced both gaps above: taxonomy fields were silently dropped from the default row mapper, and the suite pass rate was misleading for baseline/candidate-shaped suites. Both are fixed in this release.

---

## [0.6.0] — 2026-08-06

### Added

- New gate controls for warning budgets and enforcement:
	- `maxWarnings`
	- `maxWarningsByCode`
	- `failOnWarningCodes`
- Canonical new-failure keying with `newFailureKey` (`row`, `scenario`, `scenario-category`, `id-category`) to reduce multi-row inflation.
- Required suite-pass enforcement via `requiredPassingSuites` for fail-fast preflight workflows.
- Gate diagnostics output for failure reason breakdown and warning-code breakdown.
- Optional artifact contract support for `run.configSnapshot` with redaction-aware scalar values.
- Validation coverage for `run.configSnapshot` fields and value types.

### Changed

- `check` CLI now accepts warning and canonical-key gate options and surfaces diagnostics on pass/fail output.
- Completion ledger now requires explicit example/release report artifact regeneration checks when report output changes.
- Core docs now emphasize operational Why/What/How guidance for preflight gating, canonical failure counting, warning budgets, and secure config snapshots.

---

## [0.5.4] — 2026-08-05

### Added

- Baseline selection strategies for `report` and `check`: `--baseline-strategy=rolling|champion` with optional `--baseline-lookback`.
- Config support for baseline rules via `baseline.strategy` and `baseline.lookback` in `eval-dashboards.config.*`.

### Changed

- Strategy-based baseline selection now prefers candidate runs with matching `metadata.mode` (for example, avoids comparing live runs against offline runs when both are present).

---

## [0.5.3] — 2026-08-05

### Fixed

- Git/tag consumers now receive built runtime + type artifacts by shipping `dist/` in the release commit/tag.

---

## [0.5.2] — 2026-08-05

### Fixed

- Git/tag dependency installs now include built CLI/runtime output by running `pnpm build` in `prepack`, ensuring `dist/` and the `eval-dashboards` bin are available to consumers.

---

## [0.5.1] — 2026-08-05

### Fixed

- Git/tag consumption compatibility: `prepare` now skips `lefthook install` when no `.git` directory is present (for dependency installs outside a git worktree).

---

## [0.5.0] — 2026-08-05

### Added

- Explicit single-axis and multi-axis judge-calibration suite examples in `examples/llm-agent-evals` so report output clearly proves both scoring patterns.
- Threshold-key alias documentation in `docs/judge-axis-rubric-scales.md` that matches `check-gates` calibration key handling.

### Changed

- LLM agent example docs now call out side-by-side single-axis vs multi-axis calibration evidence in generated reports.

---

## [0.4.0] — 2026-08-04

### Added

- Pre-release automation for deterministic asset regeneration (`pnpm release:prepare`, `pnpm assets:regenerate`, `pnpm assets:verify`).
- Release workflow enforcement for regenerated dashboard outputs and screenshots before publish.
- Run targeting support in reporting with explicit `--run-id` alongside `--baseline-run-id`.
- Expanded preset coverage for quality, safety, tool-use, task outcome, and multi-turn trajectory starter suites.
- Industry coverage audit document with prioritized preset gaps and governance recommendations.

### Changed

- HTML report UX now defaults to collapsible sections with summary status cues and improved section-level signal density.
- Risk-area taxonomy expanded with `content-safety`, `tone-of-voice`, and `factuality` across docs, model types, validation, and schema.
- Agent-quality preset scaffold/template fixtures updated to include broader production-style eval domains.

### Fixed

- Baseline and run selection behavior now supports explicit run targeting and clearer missing-run validation.

---

## [0.3.1] — 2026-08-03

### Fixed

- Added explicit package entry and type metadata so downstream TypeScript consumers can resolve `@icodenet/eval-dashboards` public declarations.

---

## [0.3.0] — 2026-08-03

### Added

- `report-index` CLI command for generating grouped multi-report HTML indexes
- `lint` CLI command with semantic taxonomy checks before full gate enforcement
- Taxonomy lint engine with explicit rule IDs and multi-run diagnostics (`src/gates/lint-taxonomy.ts`)
- Renderer support for grouped index pages via `renderGroupedIndexHtml`
- Report provenance surfaces in HTML/Markdown (build, branch, commit, source metadata)
- Gate policy source-link rendering and report-level reference section
- Contract field `suiteManifests[].datasetPath` for portable dataset source-linking

### Changed

- HTML report UX now emphasizes decision-making context with suite pills, metadata cards, and policy evidence
- Markdown summaries now include provenance metadata and row-flip diff reporting
- Roadmap updated to include and complete Phase 3C decision-oriented reporting work
- README command references updated for new `report-index` and `lint` commands

### Fixed

- Redaction hardening in report rendering to prevent forbidden organization tokens appearing in output
- Runtime validation and schema alignment for new suite manifest source-link field

---

## [0.2.0] — 2026-08-02

### Added

- Explicit baseline selection via `check --baseline-run-id <run-id>` flag
- HTML dashboard pass-rate trend sparklines with direction indicators (↑ ↓ →)
- npm publishing GitHub Actions workflow (`.github/workflows/publish.yml`)
- `docs/npm-publishing.md`: release guide for maintainers
- Python/pytest runner example (`examples/python-pytest-evals/`) with `conftest.py` artifact emitter
- LangChain Evaluators integration example (`examples/langchain-evals/`)
- Expandable/collapsible row detail panels — click any row to reveal input, output, judge reasoning, tool calls, axis scores
- Details / Table / JSON view switcher on "Failing rows" and "All rows" sections
- Stable row IDs shown below human-readable name in monospace for traceability
- Info icons (ⓘ) on every column header and metric card with floating tooltips (JS `position:fixed`, no overflow clipping)
- Pragmatic tooltip content with concrete examples for all 11 tooltip targets
- Flat spreadsheet (Table view) showing all rows with Suite, Passed ✓/✗, Category columns
- JSON view showing raw artifact data inline for both row sections

### Changed

- HTML tables switched from `table-layout: fixed` to `auto` — columns now size to fit content
- Column separators (`border-right`) added for readability
- README Visual Gallery section updated with live light + dark theme dashboard links
- README Examples section expanded with Python and LangChain entries
- `docs/STATUS.md` and `docs/ROADMAP.md` updated: Phases 2A–3 marked complete, Phase 4 deferred

### Fixed

- Tooltip z-index clipping: CSS `::after` pseudo-elements replaced with body-level floating div
- Column header overflow: `white-space: nowrap` + `overflow: hidden` replaced with `table-layout: auto`

---

## [0.1.1] — 2026-08-02

### Added

- Phase 2A: JSON Schema export for `eval-report/v1` (5800+ lines, all type definitions)
- Phase 2A: Comprehensive taxonomy teaching documentation (`docs/taxonomy.md`, 4200+ lines)
- Phase 2A: Taxonomy-complete init fixture with realistic example scenarios
- Phase 2A+: Runner cookbook with Vitest, Jest, and Node plain-eval examples
- Phase 2A+: Refreshed README with schema-first positioning and adoption metrics

### Changed

- README now leads with standardized schema and taxonomy, not just dashboards
- HTML reports now show all rows grouped by dataset and scenario

### Verified

- All 33 tests passing
- TypeScript strict mode clean
- GitHub Actions CI workflow active
- Example runners working with taxonomy-complete artifacts

---

## [0.1.0] — 2026-07-XX

### Initial Release (Foundation)

- Phase 1: Project foundation with naming alignment and CI setup
- Versioned `eval-report/v1` model with JSON Schema validation
- First-class optional agent and LLM judge fields
- Portable suite manifest, gate policy, and rubric contract fields
- Baseline compatibility assessment for dataset/rubric version drift
- Report discovery and history building
- Latest-vs-previous run comparison
- Quality gate enforcement (minPassRate, maxNewFailures, zeroCritical)
- Text, JSON, Markdown, and HTML reporters
- Local directory and dry-run GitHub Pages/Azure publishing
- CLI with 6 commands: `report`, `check`, `publish`, `merge`, `history`, `init`
- Configuration loading from TypeScript, JavaScript, and `package.json`
- Comprehensive test suite (33 tests, all passing)

---

## Versioning Policy

### Format: MAJOR.MINOR.PATCH

- **MAJOR** (breaking): Core schema changes, incompatible API changes
- **MINOR** (features): New optional fields, new reporters/publishers, new commands
- **PATCH** (fixes): Bug fixes, documentation updates, dependency patches

### 0.x Stability

While in 0.x, the project is actively evolving. Breaking changes may occur with minor version bumps. We recommend pinning to exact versions (`"@icodenet/eval-dashboards": "0.1.1"`) until 1.0.0.

### 1.0.0 Readiness

We'll target 1.0.0 when:

- [ ] Public API is stable (eval-report/v1 schema finalized)
- [ ] 3+ external runners emit taxonomy-complete artifacts
- [ ] Community has adopted the schema and taxonomy
- [ ] All Phase 3 documentation complete
- [ ] Semantic versioning enforced with tests and CI

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to report issues, request features, and submit pull requests.

---

**Built with ❤️ for the AI evaluation community.** If you use eval-dashboards, please star the repo and share it with others!
