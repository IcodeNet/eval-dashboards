# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** While in 0.x, breaking changes may occur with minor version bumps as the public API stabilizes.

---

## [Unreleased]

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
