# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** While in 0.x, breaking changes may occur with minor version bumps as the public API stabilizes.

---

## [Unreleased]

### Fixed

- The `Publish to npm` workflow pinned Node 22.14.0, which the Astro docs site refuses to build on, so a release stopped before publishing. It now uses the latest Node 22.

## [0.10.0] — 2026-10-19

### Added

- **Docs now state two behaviours that surprised testers.** `publish --target=github-pages --dry-run` still needs a GitHub token, and `report --profile=guardrail` renders the same page as the default profile when no row fails. Tests lock both in.
- **Docs site: a Copy button on every code block, the eval-dashboards and Langfuse logos, and a "These pages have moved" notice on each old `/v1/` page** that links to its current page. The old pages stay up so existing links keep working.
- `eval-dashboards --version`, `-v` and `version` print the installed version, for bug reports.
- **Per-suite thresholds.** `gates.suites` in the config file sets `minPassRate` and `maxNewFailures` for each suite, on top of the global gates. A suite named there that is missing from the run fails the gate, and `--baseline-gate-config` treats a looser per-suite bar as a loosening.
- `check --step-summary-out=<path>` appends a Markdown gate summary to a file, for example `$GITHUB_STEP_SUMMARY`.
- `evidence-export --redact` embeds a redacted copy of the report (public tier only). The entry carries `redacted: true` and a `sourceDigest`, the sha256 of the original file. The bundle still verifies. Without the flag the bundle still embeds the full report.

### Changed

- **Automatic baseline selection now skips runs that share no suite with the current run.** Before, the default rolling baseline could be a run of a different suite, which made the comparison meaningless. If no earlier run shares a suite, there is no baseline, so every failing row counts as newly failing and `--max-new-failures` can fail where it used to compare against an unrelated run. Pass `--baseline-run-id` to pick a baseline on purpose.
- **Unknown keys in the config file now fail with exit 2.** A misspelled key such as `gates.minPassRat` used to be ignored, which silently turned that gate off. The error names the key and suggests the closest valid one. If your config has extra keys, remove them or fix the spelling.

### Fixed

- **`--waiver-file` now covers every gate it documents.** A waived row used to count as passed only for `--min-pass-rate`. It was still counted by `--zero-critical`, `--max-new-failures` and `--require-suite-pass`, so a waived critical failure still failed those gates. The waiver now clears the row's severity, recounts its suite, and recomputes the new-failure comparison. The waiver is still listed in the check result, and `newlyFailingRows` still shows the row.
- `report --theme=<name>` with a name that is not built in (`default`, `dark`, `minimal`) now exits 2 with a "did you mean" hint. It used to exit 0 and use the default theme.
- `check --new-failure-key=<value>` with an unknown value now exits 2 and lists the four valid keys. It used to be treated as `row`.
- `gates.allowLoosening: true` in the config file was ignored, so an approved loosening still failed the gate. It now takes effect, as the docs said.
- `history-report` and `history-convert` now say how to create the history file when it is missing, instead of a bare `ENOENT` message.
- A failing notification webhook no longer prints the reply body, which could contain a secret. Only the status code is shown.
- Terminal control codes in artifact text (colour, cursor and title codes, carriage returns) are stripped from gate failures and diagnostics, so a crafted artifact cannot forge or clear CI log lines.
- The same control codes are stripped from the row id, suite, category and severity in the step summary, JUnit, SARIF and annotation outputs.
- A broken eval report or `history.json` now fails with the file name and a fix, not a bare JSON parser message.
- Reports, history and other output files are written to a temp file and renamed, so a crash or full disk never leaves a half-written file.
- `sign`, `verify` and `schema` now reject unknown or misspelled flags like every other command, instead of silently ignoring them.

---

## [0.9.0] — 2026-10-18

### Added

- Long-range history. `history` can write a SQLite file (`.sqlite`, `.sqlite3`, `.db`) as well as `history.json`, behind a small `HistoryStore` adapter. SQLite uses Node's built-in `node:sqlite` and needs Node 22.5 or newer; the JSON store still works on Node 20.
- `history-convert` copies history between `history.json` and SQLite in either direction.
- `history-report` writes a static trend page filtered by date range, branch and suite, with retention (`--keep-last`, `--max-age-days`, `--prune-to`). See `docs/history-storage.md`.
- `import --from=inspect-ai` and richer LangSmith import metadata (address and revision).
- Library exports for the history stores: `createHistoryStoreForPath`, `createFileHistoryStore`, `createSqliteHistoryStore`, `queryHistory`, `applyRetention`, `buildTrendSeries`.
- `require('@icodenet/eval-dashboards')` now works (a `default` export condition).
- `docs/faq.md` (what the tool does not do, platforms, network use), `SECURITY.md`, a signing guide, and a recipe to check an evidence bundle without this tool.
- `pnpm a11y:verify` runs axe-core against the generated report in all three themes.
- Logo and Langfuse credit in the README, plus long-range history screenshots.

### Changed

- **`init` now writes `eval-dashboards.config.mjs` instead of `.ts`.** The `.ts` file failed to load on Node 20 and on projects without `"type": "module"`, which broke the next command. Existing `.ts` configs still load where Node can import TypeScript.
- **`publish --redact` removes more.** It now also drops judge traces, per-axis reasoning, human-review notes and reviewer names, check expected and actual values, run config values, trace and span URLs, and free-form row metadata (provenance and lifecycle are kept). The publish preflight lists these fields. Row `name` and run `tags` are still published. If you relied on any of the removed fields appearing in published reports, they no longer do.
- Gates fail closed on bad configuration and numeric options, duplicate identities and unscoped comparisons (#32).
- Report colours were darkened to meet WCAG contrast (4.5:1) in the default, dark and minimal themes, and the report now has `header`, `main` and `footer` landmarks.
- Dependencies: pnpm 12, vitest 5, tsup 9, lefthook 2, commitlint 21, and current GitHub Actions majors. TypeScript stays on 5.9 because tsup's declaration bundler does not yet support TypeScript 7.

### Fixed

- `adjudicate import` built its default output file name from `run.id` with no checks, so a run id such as `x/../../package` could overwrite a file outside the report folder. File names are now sanitised.
- SQLite history failed in the built CLI on every Node version because the bundler removed the `node:` prefix. A packed-package test now runs it.
- Runs with the same timestamp could come back in a different order from SQLite. A `position` column keeps write order (schema version 2; version 1 files still read and are upgraded on the next write).
- Parallel writers to one SQLite file failed with `database is locked`; a writer now waits up to 10 seconds.
- `history-report --until=2026-06-30` excluded runs made on that day. A plain date now covers the whole day.
- History entries with an unreadable `generatedAt` silently passed `--since` filters; they now raise a clear error.
- The shipped `basic-json`, `taxonomy-complete-fixture` and `llm-agent-evals` examples failed the tool's own lint and gate checks.

## [0.8.0] — 2026-10-07

### Added

- OpenAI Evals migration aliases (`oaieval`, `oaievals`, and `openai-eval`)
  normalize to the existing `openai-evals` importer, with JSONL coverage and a
  migration guide that documents the supported event formats.
- OTel GenAI imports retain provider request and response identifiers, and use
  the response identifier as the stable row-id prefix when no span id exists.
- A checked-in packed-package consumer verifier installs the actual tarball,
  compiles public types, and exercises runtime, schema, and CLI exports.
- Local commit safeguards require successful quality logs and an
  evidence-backed review for the exact staged tree in both Codex and Lefthook.
- Cost/latency-quality frontier sections in markdown/html reports when row-level `score` plus `durationMs`/cost metadata are present.
- Benchmark-pack templates for safety, tool-routing, and groundedness under `examples/benchmark-packs/` with compatibility guidance.
- Docs-site assistant-ui reference integration page with reproducible lint/check/report/publish command flow.
- Independent calibration evidence fixture `examples/agent-quality-preset/artifacts/run-agent-quality-calibration.json` (`run.kind: "calibration"`) for runnable blocking-preflight examples.
- Calibration preflight controls: `--calibration-preflight`, `--no-calibration-preflight`, and `gates.calibration.enabled` for explicit force-enable/disable behavior.
- Dataset governance lint checks for coverage/versioning gaps (4E.5).
- JSONL input support for `import`, in addition to JSON (4E.10).
- `import --from=otel-genai` maps OpenTelemetry GenAI `gen_ai.evaluation.result` events (span-event or log-record encoding, JSON or collector JSONL) to `llm-judge` rows with trace references (4J.1).
- `import --from=otel-genai --case-id-attribute=<key>` builds row ids from a stable case-id attribute (event or log record, then span for span events, then resource), so baseline comparisons across runs report persistent failures instead of treating every failure as new.
- Runner adapter default row mapper now passes `trace` through from case results.
- Ragas and Langfuse coded import adapters (4E.9 partial), plus an OpenAI eval-outputs import adapter (4E.9 complete) and an eval-ai-library import adapter (4F.11 docs / 4E.11).
- `schema` CLI command prints the bundled eval-report/v1 JSON Schema (Draft 7) to stdout, so third-party runners can discover and pipe it without reaching into `node_modules` or GitHub raw.
- Two-reviewer-by-default adjudication requirement (4E.4).
- `init` presets for output-handling-safety and prompt-leakage-resilience suites (4E.6).
- `publish --redact` for two-tier (redacted/full) artifact splits (4F.1), with a hard-fail preflight when evidence isn't redacted (4F.2).
- `eval-check-result/v2` audit-provenance output from `check` (4F.3).
- `sign`/`verify` CLI for artifact digest signing, including cosign keyless mode (4F.4).
- Structured per-row assertion evidence: optional `rows[].checks?: Array<{ type, expected?, actual?, threshold?, pass, weight? }>` for recording which named check(s) produced a row's pass/fail, rendered as a per-row checks table in HTML (4F.24).
- Waiver/exception register for gate bypasses (4F.5), plus detection of gate config loosening vs baseline (4F.6).
- `heartbeat-verify` command (4F.7) and a static offline org rollup view in `history` (4F.8).
- Bypass accounting for gate escape hatches (4F.9), and PR-subset vs full-suite gate tiering with a cost budget (4F.10).
- `evidence-export`/`evidence-verify` bundle command (4F.11).
- First-class usage metrics path for tokens/cost/latency (4D.2).
- `github-pr-comment` publish target with in-place comment updates (4I.1), and a versioned composite GitHub Action packaging the CLI (4I.2).
- Hard-fail CI gate on `pnpm audit` high/critical vulnerabilities (4F.12).
- Offline client-side compare view in the HTML report (4F.13).
- Optional top-level `tags` on `eval-report/v1` (4F.15) and compliance-framework tagging fields (4F.14).
- Optional `trace.spanType` tagging on rows (4F.16), optional per-axis `axisReasoning` alongside `axisScores` (4F.17), and optional suite `scoreScale` for non-normalized scores (4F.18).
- Generalized stale embedded help-text sweep in the CLI-help verification tooling (4H.5).
- Optional `rows[].humanReviews` (independent multi-reviewer verdicts) and `rows[].reviewAgreement` (inter-rater agreement, 0-1) on rows, distinct from the existing singular `groundTruthVerdict`/`groundTruthAnnotation` (4F.19).
- Optional `run.experimentId`/`run.variantLabel` grouping key for clustering variant runs (e.g. prompt v1/v2/v3), surfaced in the HTML report banner/metadata card and markdown table (4F.20).
- Optional `rows[].repeated?: { runs; passes; aggregation: 'mean' | 'majority' | 'all' }` to represent a row's result when a judge was run multiple times to absorb non-determinism, rendered as a detail near the row's pass/fail (4F.22).

### Changed

- npm trusted publishing from `main` is now the sole supported release path;
  the unused token-based Semantic Release experiment and dependencies were
  removed.
- Breaking: calibration preflight now requires independent evidence for blocking suites (same-run calibration rows no longer satisfy blocking checks) and validates calibration rubric metadata before gate evaluation.
- Benchmark pack fixtures now use valid `datasetSource` enum values and suite-manifest thresholds aligned with implemented gate semantics.
- Pack compatibility test now validates templates through `validateEvalReport` using `suiteManifests`, not string-shape checks only.
- Pack JSON templates are now included in npm package `files` for downstream consumers.
- `report --reporter` now exits 2 on unknown reporter values instead of silently skipping output generation; `markdown` is accepted as an alias for `markdown-summary`.
- Automatic baseline selection (`--baseline-strategy`) now excludes runs with `run.kind: "calibration"` so calibration-only artifacts do not become report/check baselines.
- The GitHub Action now installs the CLI via `npx --package` for tarball installs instead of a bare `npx` invocation.

### Fixed

- Frontier markdown table rendering now escapes `|` and newline cell content.
- Markdown summary table cells for run metadata (`branch`, `commit`, `buildId`, `experimentId`, `variantLabel`, `tags`) now route through the same cell-escaping helper as every other markdown table field, preventing a `|` or newline in these values from corrupting the table structure.
- Frontier extraction now treats `score` and `durationMs` as strict numeric fields (no coercion of `null`/string to `0`).
- CLI now rejects unknown flags instead of silently ignoring them.
- CLI now warns instead of silently ignoring an unparsable numeric flag, and warns on a typo'd `--max-warning-code`.
- Gates now fail closed on a broken config file instead of silently falling back, and warn on typo'd threshold keys.
- `report`/`check`/`publish` no longer mistake previously-generated output (`summary.json`, `history.json`, etc. under `--report-dir`) for input artifacts on a rerun against the same `--input` directory; the resolved report directory is now excluded from the recursive artifact scan.
- `check` no longer silently discards config-file gate thresholds (`minPassRate`, `zeroCritical`, `failOnWarningCodes`, `requiredPassingSuites`, etc.) — the CLI-options-to-gate-overrides merge previously spread explicit `undefined`/default-empty values over real config-file values, meaning a config file's gates were only honored if every corresponding CLI flag also happened to be unset in a way that produced `undefined`; now unset CLI flags are correctly treated as "no override" and never clobber the config file.
- README/ROADMAP corrected: the GitHub Action's documented `uses:` reference pointed at a non-existent `icodenet/eval-dashboards-action@v1` repo/tag; fixed to the real `IcodeNet/eval-dashboards@v0.8.0`.
- `ci.yml`, `action-smoke-test.yml`, and `pr-title-lint.yml` now declare an explicit least-privilege `permissions: contents: read` block.
- `config`/CLI now fail closed on a broken `package.json` instead of silently continuing.
- The npm package no longer ships a repo-only artifact-regeneration script.
- `publish --target=azure-storage` no longer builds Azure CLI commands via shell-string interpolation — `--account`/`--container`/`--report-dir` values (which may come from CI variables, branch names, or config) could previously inject arbitrary shell commands via `execSync`; now uses `execFileSync` with an argv array, which never invokes a shell.

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to report issues, request features, and submit pull requests.

---

**Built with ❤️ for the AI evaluation community.** If you use eval-dashboards, please star the repo and share it with others!
