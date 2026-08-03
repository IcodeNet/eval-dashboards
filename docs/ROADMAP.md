# Roadmap — @icodenet/eval-dashboards

This document captures the prioritized improvement plan for the project.
It complements `docs/STATUS.md` (tactical checklist) and `docs/PRP.md` (original product requirements).

**Last updated:** 2026-08-03

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

## 🚧 Phase 3B: Governance Hardening & Output Safety (IN PROGRESS)

This phase closes gaps discovered while comparing the package against a mature regulated eval workflow. Focus: make comparisons trustworthy, strengthen taxonomy correctness, and enforce safe report output defaults.

### Backlog (all identified gaps)

- [x] Enforce baseline compatibility in gates (blocked baseline must fail `check` unless explicitly bypassed)
- [x] Fix taxonomy completeness scoring bug for `judgeVerdict: false` rows
- [x] Add report output redaction safeguards for forbidden organization tokens in rendered dashboards
- [x] Tighten suite manifest validation rules for rubric governance (e.g., stricter `rubricVersion` requirements)
- [x] Add first-class row provenance and lifecycle conventions in schema/docs (portable, runner-agnostic)
- [x] Add optional dataset/rubric changelog artifact surface and reporter rendering
- [x] Extend gate threshold support beyond pass rate (e.g., tool recall and other typed metrics)
- [x] Add fast semantic/taxonomy lint preflight before expensive eval stages

### Implementation order

1. **Trustworthy gating first**
   - baseline compatibility enforcement in `check`
   - keep backward compatibility with explicit opt-out flag/config
2. **Taxonomy correctness next**
   - fix `judgeVerdict` false handling in completeness scoring
   - add regression tests
3. **Output safety defaults**
   - redact forbidden organization tokens in rendered output
   - add tests covering banner/meta/row content
4. **Contract hardening**
   - stricter rubric governance validation
   - provenance/lifecycle/changelog schema extensions (optional, additive)
5. **Richer policy gates + preflight lint**
   - typed threshold evaluators
   - fast lint command for semantic consistency

---

## ✅ Phase 3C: Decision-Oriented Reporting UX (COMPLETE)

This phase ports proven reporting concepts from production eval workflows while keeping this package runner-agnostic and artifact-first.

### Backlog (portable concepts)

- [x] Add report-level provenance badge in HTML (single-suite `ds/rb` or multi-suite manifest hash)
- [x] Add suite pass-rate pills in HTML header for faster triage
- [x] Expand markdown summary with decision-oriented diff (`newly failing` / `newly passing`)
- [x] Add report metadata cards parity pass (reported duration, build, branch, commit with richer help semantics)
- [x] Add optional "how to read this report" reference section for onboarding
- [x] Add optional gate-policy source linking convention (dataset/rubric source paths, additive contract extension)
- [x] Add multi-report grouped index mode (agent/judge target rollups from discovered artifacts)

### Implementation order

1. **Fast triage surfaces first**
   - provenance identity in header
   - suite pass-rate pills
2. **PR review ergonomics**
   - markdown diff sections for row flips
3. **Adoption usability**
   - metadata clarity and reference help
4. **Portfolio view**
   - grouped multi-report dashboard mode

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

## 🚧 Phase 4A: Ask Byron Proving Ground & Setup Layer (PLANNED)

This phase runs two parallel streams that feed each other:

1. **Ask Byron integration stream** proves the package against a real assistant eval program.
2. **eval-dashboards setup-layer stream** turns repeated integration patterns into reusable presets, templates, and guidance.

The schema should remain runner-agnostic and portable. Domain-specific suite names should generally be shipped as documented presets/templates rather than hard-coded schema enums, unless a concept proves broadly reusable across eval programs.

### Stream A: Ask Byron eval integration

- [x] Inspect the existing Ask Byron eval runner, datasets, and CI wiring
- [x] Add `@icodenet/eval-dashboards@0.3.0` as an explicit dev dependency
- [x] Map current Ask Byron eval results into `eval-report/v1`
- [x] Emit `.evals_output/*.json` artifacts from existing eval runs
- [x] Add suite manifests, dataset versions, rubric versions, and dashboard gates
- [x] Wire `eval-dashboards lint`, `check`, and `report` into Ask Byron workflows
- [ ] Add rubric contracts plus row provenance/lifecycle metadata
- [ ] Generate the first published dashboard baseline and document initial quality gaps

### Stream B: eval-dashboards setup-layer evolution

- [ ] Define reusable agent-quality suite templates, starting with:
   - `retrieval-recall`
   - `answer-groundedness`
   - `answer-quality`
   - `refusal-safety`
   - `prompt-injection-resilience`
   - `mcp-routing`
   - `content-coverage`
   - `regression-incidents`
   - `judge-calibration`
- [ ] Decide which concepts belong in schema fields/enums vs preset files vs documentation
- [ ] Add setup scaffolding for common agent eval programs (for example, `init --preset agent-quality`)
- [ ] Add starter dataset and rubric templates with versioning, provenance, lifecycle, and calibration examples
- [ ] Add docs showing how suite presets map to `riskArea`, `target`, `graders`, gates, and rubric contracts
- [ ] Feed Ask Byron integration lessons back into templates before treating them as stable
   - Directory inputs are safer than literal glob strings in config (`input: ['.evals_output']`).
   - Blocking suite manifests need explicit `rubricVersion` values.
   - Setup scaffolding should clean generated `.evals_output` before writing the current artifact.
   - Summary totals must be row-complete; aggregate-only suites create lint failures.

### Proposed suite preset mapping

| Suite preset | Primary risk area | Target | Typical graders |
|---|---|---|---|
| `retrieval-recall` | `relevance` | `agent` | `deterministic-assertions`, `tool-call-check` |
| `answer-groundedness` | `groundedness` | `agent` | `llm-judge`, `human-labelled-calibration` |
| `answer-quality` | `response-quality` | `conversation` | `llm-judge`, `human-labelled-calibration` |
| `refusal-safety` | `prompt-safety` / `pii` | `agent` | `deterministic-assertions`, `llm-judge` |
| `prompt-injection-resilience` | `prompt-safety` | `agent` | `deterministic-assertions`, `llm-judge` |
| `mcp-routing` | `tool-routing` | `agent` | `tool-call-check` |
| `content-coverage` | `relevance` | `agent` | `deterministic-assertions`, `llm-judge` |
| `regression-incidents` | `custom` | `agent` | `deterministic-assertions`, `llm-judge` |
| `judge-calibration` | `custom` | `judge` | `human-labelled-calibration` |

### Implementation rule

Start with presets, fixtures, docs, and CLI scaffolding. Amend `eval-report/v1` only when Ask Byron or another real integration proves that a setup concept is portable enough to become part of the shared artifact contract.

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
