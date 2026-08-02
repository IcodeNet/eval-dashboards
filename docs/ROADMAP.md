# Roadmap — @icodenet/eval-dashboards

This document captures the prioritized improvement plan for the project.
It complements `docs/STATUS.md` (tactical checklist) and `docs/PRP.md` (original product requirements).

**Last updated:** 2026-08-02

---

## ✅ Phase 1: Fix consistency & polish the foundation (COMPLETE)

- [x] Naming alignment → Swept 54 references across 21 files
- [x] Implement `eval-dashboards init` config generation
- [x] Full config loading from `eval-dashboards.config.ts`, `.js`, and `package.json`
- [x] Enforce suite-manifest gate policy thresholds in `check`
- [x] Add GitHub Actions CI workflow (typecheck + test + build + example smoke tests)

**Outcome:** Foundation is solid. All 33 tests passing, TypeScript clean, CI workflow active.

---

## ✅ Phase 2A: Strengthen the contract & teach taxonomy (COMPLETE)

The schema is only useful if runners emit it. Phase 2A made taxonomy first-class through docs + examples.

### What's done:
- [x] Export JSON Schema for `eval-report/v1` → `schemas/eval-report-v1.schema.json` (5800+ lines, all definitions)
- [x] Create `docs/taxonomy.md` → Complete teaching guide with definitions, examples, and checklist (4200+ lines)
- [x] Taxonomy-complete init fixture → `examples/taxonomy-complete-fixture/run-complete.json` + README
- [x] Runner cookbook for Vitest, Jest, and plain Node (with examples and step-by-step guides)
- [x] README updated to lead with schema + taxonomy + adoption messaging + Visual Gallery with live dashboards
- [x] Taxonomy completeness score (0–100%) displayed in HTML reports as visual indicator

### Adoption metrics (tracking for Phase 2A by 2026-Q4):
- [ ] **Metric 1:** 5+ external eval runners discover this project (GitHub stars, discussions)
- [ ] **Metric 2:** 1 external runner emits taxonomy-complete artifacts (demonstrates schema adoption)
- [ ] **Metric 3:** JSON Schema cited in 2+ other eval projects (external validation)
- [ ] **Metric 4:** 100+ npm weekly downloads (ecosystem adoption)

---

## ✅ Phase 2B: Improve HTML reporter & grouping (COMPLETE)

- [x] HTML styling and theming (light/dark modes with CSS variables and data-theme attribute)
- [x] Grouping by dataset and scenario with collapsible sections
- [x] Taxonomy completeness score (0–100%) with visual indicators for missing fields
- [x] Pass-rate trend visualization with sparklines and direction indicators (↑ improving, ↓ regressing, → stable)
- [x] Flaky row detection and persistent failure classification via `analyzeRowStability()`
- [x] Kind badges (deterministic, agent, llm-judge, human-review) for row classification
- [x] Severity chips (low, medium, high, critical) for failure prioritization

---

## ✅ Phase 2C: Complete examples & publishing (COMPLETE)

- [x] Jest custom reporter example with README and step-by-step guide
- [x] Vitest eval example with README and patterns
- [x] Plain Node/TypeScript eval example with README and use cases
- [x] Production Azure Static Web Apps publishing (real, not dry-run)
- [x] Production Azure Storage publishing (real, not dry-run)
- [x] Explicit baseline selection by run id via `selectBaseline()` and `--baseline-run-id` CLI flag
- [x] Persistent failure and flaky row classification with historical trend analysis

---

## ✅ Phase 3: Documentation & Discoverability (COMPLETE)

- [x] Expanded README with:
  - Working screenshots of light and dark themes with Visual Gallery section
  - One-command "try it" using existing examples
  - Value prop section: "Why @icodenet/eval-dashboards?" (vs full platforms)
  - Direct link to schema and taxonomy.md
- [x] Added `CONTRIBUTING.md` with development workflow, project structure, and commit guidelines
- [x] Added `CODE_OF_CONDUCT.md` (Contributor Covenant-based)
- [x] Created GitHub issue templates (bug report, feature request)
- [x] Started `CHANGELOG.md` and adopted semantic versioning (0.x while evolving)

---

## 🔄 Phase 4: Shipping & Adoption (DEFERRED)

Per user directive: "adoption and shipping should be done last when we are ready."

**Will include:**
- Publish to npm (when public API is stable after Phase 2C)
- Announce on Reddit, HN, AI Discord/Slack, eval-focused newsletters
- Make GitHub Actions + Azure DevOps examples production-ready and copy-paste friendly
- Open well-scoped "good first issues" for contributors
- Establish feedback loop with early runners

**Prerequisites before Phase 4 unlock:**
- [x] npm publishing workflow (GitHub Actions for version tags & releases) — IN PROGRESS
- [ ] Community seeding (early runner partnerships and outreach)

---

## 🔮 Longer-term ideas (post-v1.0)

- Plugin system for custom reporters (existing custom-reporter-plugin example is a starting point)
- Optional local web-server mode for interactive exploration (pure-static output remains default)
- Deeper risk-area / tool-routing focused views
- Cost / token / latency aggregation when rows carry those fields
- Diff views between any two runs (not just latest-vs-previous)
- AI-powered suggestions for suite manifests and rubric versions based on historical data

---

## 🎯 Recommended next steps (prioritized by impact)

**Immediate (next 1–2 weeks):**
1. npm publishing workflow (GitHub Actions for semantic versioning, releases, npm publish)
   - Unblocks teams to `npm install @icodenet/eval-dashboards`
   - Required for Phase 4 unlock

**Short term (Phase 4 preparation, next 2–3 weeks):**
2. Community seeding: early runner partnerships and integration examples
   - Validates adoption readiness
   - Gathers feedback before public announcement

**Medium term (Phase 4 execution, post-npm readiness):**
3. Public npm release + announcement
4. GitHub Actions + Azure DevOps templates for production use
5. Community building (issues, feedback, iterations)

---

## Product philosophy

- **Runner-agnostic core:** No dependency on a single eval harness, LLM vendor, or cloud
- **Artifact-first:** Improving the contract is more important than adding one-off dashboard features
- **Offline by default:** Static reports work without a server
- **Teaching via examples:** The taxonomy is taught through docs, schema, and runnable fixtures—not discovered by trial-and-error

The core idea — an Istanbul-style, offline, artifact-first reporting layer for agent and LLM evals — is timely and differentiated. Finishing Phase 2A + 2B establishes the contract and makes it visible; Phase 3–4 drives ecosystem adoption through community.
