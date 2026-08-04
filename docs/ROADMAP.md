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

### Adoption KPIs (live tracking for Phase 2A by 2026-Q4):
- **Target 1:** 5+ external eval runners discover this project (GitHub stars, discussions)
- **Target 2:** 1 external runner emits taxonomy-complete artifacts (demonstrates schema adoption)
- **Target 3:** JSON Schema cited in 2+ other eval projects (external validation)
- **Target 4:** 100+ npm weekly downloads (ecosystem adoption)
- **Tracking loop:** `pnpm metrics:adoption` writes `docs/adoption-metrics/latest.json` and reads `docs/adoption-metrics/manual-signals.json`

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

## ✅ Phase 4: Shipping & Adoption (ROADMAP IMPLEMENTATION COMPLETE)

Per user directive: "adoption and shipping should be done last when we are ready."

**Completed in-repo shipping/adoption assets:**
- Publish to npm (when public API is stable after Phase 2C)
- Make GitHub Actions + Azure DevOps examples production-ready and copy-paste friendly
- Open well-scoped "good first issues" for contributors
- Establish feedback loop with early runners
- Add partnership tracking log and outreach stage definitions
- Add adoption metrics snapshot script and manual signal tracker

**Phase 4 prerequisites:**
- [x] npm publishing workflow (GitHub Actions for version tags & releases)
- [x] Community seeding loop infrastructure (outreach log + metrics cadence)

**External outcomes remain ongoing:**
- Real-world adoptions, citations, and partnerships are tracked as KPIs in `docs/adoption-metrics/latest.json` and `docs/community-partnership-log.md`.

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
- [x] Add rubric contracts plus row provenance/lifecycle metadata
- [x] Surface the generated `/eval-dashboard/` report in the host app instead of a bespoke summary-card dashboard
- [x] Generate the first published dashboard baseline and document initial quality gaps

### Stream B: eval-dashboards setup-layer evolution

- [x] Publish TypeScript declaration files for package consumers
   - Generate `.d.ts` files in `dist` during `pnpm build`.
   - Add package metadata (`types` / export typings) so imports like `import type { EvalReportV1 } from '@icodenet/eval-dashboards'` resolve in downstream projects.
   - Add a package-consumer smoke test that installs/builds against the packed package and verifies public types resolve.
- [x] Define reusable agent-quality suite templates, starting with:
   - `retrieval-recall`
   - `answer-groundedness`
   - `answer-quality`
   - `refusal-safety`
   - `prompt-injection-resilience`
   - `mcp-routing`
   - `content-coverage`
   - `regression-incidents`
   - `judge-calibration`
- [x] Decide which concepts belong in schema fields/enums vs preset files vs documentation
- [x] Add setup scaffolding for common agent eval programs (for example, `init --preset agent-quality`)
- [x] Add starter dataset and rubric templates with versioning, provenance, lifecycle, and calibration examples
- [x] Add docs showing how suite presets map to `riskArea`, `target`, `graders`, gates, and rubric contracts
- [x] Add a repo-context glossary for terms that may be new to users, especially `eval-report/v1`, `suite`, `dataset`, and `rubric`
   - Explain `eval-report/v1` as version 1 of the JSON artifact contract that runners emit and eval-dashboards validates/reports on.
   - Explain each term in the context of the artifact contract, setup scaffolding, generated reports, and real integrations such as Ask Byron.
   - Show how the terms relate: datasets provide cases, suites group cases by intent/risk, and rubrics define the scoring rules and pass/fail expectations.
- [x] Add runner-adapter primitives for teams starting from existing eval results
   - Do not absorb app-specific dataset contracts such as Ask Byron's `GoldenCase` or exact `EvalRunSummary` shape.
   - Provide portable inputs for run metadata, suite case results, suite manifest defaults, rubric contracts, provenance/lifecycle defaults, and output writing.
   - Helpers compute suite totals from rows so adapters cannot drift into aggregate-only summaries.
   - Keep raw test case data as a project concern; only the normalized row evidence and governance metadata should cross into `eval-report/v1`.
- [x] Capture GitHub approval-gate and dashboard branch pattern as reusable docs/examples
   - Document branch-as-database layout (`main/`, `pr/`, history manifests, `pr-meta.json`) and retention caps.
   - Provide workflow templates for status transitions (`pending` -> `success|failure`) with environment approvals.
   - Provide cleanup workflow template for closed PR data in the publish branch.
- [x] Feed Ask Byron integration lessons back into templates before treating them as stable
   - Directory inputs are safer than literal glob strings in config (`input: ['.evals_output']`).
   - Blocking suite manifests need explicit `rubricVersion` values.
   - Setup scaffolding should clean generated `.evals_output` before writing the current artifact.
   - Summary totals must be row-complete; aggregate-only suites create lint failures.
   - Host apps must expose or embed the generated static report; separate handcrafted dashboard cards drift from the canonical renderer.
   - Deploy workflows should fail if the expected generated dashboard is missing instead of publishing a placeholder or stale report.
   - Published packages need explicit `main`, `types`, and `exports` metadata; declaration files in `dist` are not enough for downstream TypeScript consumers.

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

### Setup-layer planning slices

These slices turn the Ask Byron proving-ground work into reusable setup-layer work without baking Ask Byron-specific suite names into the core contract.

#### Dataset governance

- Define dataset file layout conventions for golden sets, labelled judge sets, regression incidents, and calibration examples.
- Require stable case ids, dataset versions, lifecycle status, owner/reviewer notes, and change reasons in examples/templates.
- Teach promotion flow: proposed case -> active blocking case -> deprecated/archived case, with changelog evidence.
- Include setup checks that fail on duplicate ids, missing lifecycle metadata, or suites whose totals do not match row evidence.

#### Versioned rubrics

- Provide starter rubric contracts for retrieval, groundedness, answer quality, factuality, tone of voice, refusal safety, content safety, prompt-injection resilience, tool routing, and judge calibration.
- Ensure rubric axes cover high-signal safety and trust domains that are common across industry eval programs (for example: toxicity/hate, self-harm, sexual safety, violence, bias/fairness, privacy/PII handling, and hallucination resistance), while keeping schema requirements runner-agnostic.
- Treat rubric versions as gate inputs: blocking suites must declare rubric versions and source paths.
- Document when to bump rubric versions: scoring scale changes, axis changes, prompt wording changes that alter expected verdicts, or calibration-set changes.
- Keep rubric templates as preset/docs first; only add schema fields when multiple integrations need the same portable concept.

#### Judge calibration

- Add a human-labelled calibration preset with expected verdicts, axis scores, and allowed tolerance bands.
- Include drift checks that compare current judge output to labelled examples before live quality gates run.
- Track judge model, judge prompt/rubric version, sample size, and disagreement rate in artifacts and reports.
- Keep calibration report-only until the labelled set is stable, then allow teams to opt into blocking thresholds.

#### CI quality tiers

- Define three tiers in templates: offline wiring gates for PRs, live quality gates for main/deploy, and scheduled monitoring for drift.
- Make expensive live checks opt-in and secret-aware, while still producing a report-only artifact when cloud credentials are absent.
- Recommend `lint` before expensive evals, `check` after artifact emission, and `report`/`publish` after gates are evaluated.
- Include fallback behavior for deploys: if dashboard generation fails, serve an explicit placeholder rather than silently showing stale data.

#### Suite templates

- Ship suite template docs/fixtures for the proposed presets above, each with target, risk area, graders, dataset expectations, rubric contract, and suggested gates.
- Mark presets experimental until at least Ask Byron plus one other integration validates the shape.
- Keep preset names stable enough for docs and generated config, but avoid requiring them in `eval-report/v1`.

#### Setup scaffolding

- Extend `init` with an agent-quality preset that writes config, example datasets, rubric templates, and CI snippets.
- Generate directory-based config inputs by default (`input: ['.evals_output']`) and clean generated output before writing a new artifact.
- Include host-app static dashboard guidance: generate `eval-dashboard/`, copy it into the deployed static app, and link/embed `/eval-dashboard/` as the canonical report surface.
- Provide a dry-run mode that prints planned files and commands before writing templates.

#### Runner adapter primitives

- Add a small public adapter API for teams that already have an eval runner but no artifact discipline yet.
- Recommended shape: a normalized `RunnerEvalResult` / `RunnerEvalCaseResult` input plus `createEvalReportArtifact(...)` and `writeEvalReportArtifact(...)` helpers.
- The helper should accept project-specific row mapping callbacks, because prompts, questions, expected source files, and local categories differ by product.
- The helper should own repeatable mechanics: stable row ids, suite totals from rows, suite manifest defaults, rubric contract attachment, provenance/lifecycle defaults, run metadata, validation, and generated-output cleanup.
- Avoid hard-coding Ask Byron suite ids. Use suite presets as optional defaults that can be renamed or overridden by the consuming team.

#### Schema and taxonomy decision rules

- Add schema fields only for concepts that are portable across runners and domains, not for one assistant's suite taxonomy.
- Prefer preset metadata or docs for opinionated setup defaults; use validation/lint rules to teach completeness before making fields required.
- Keep `eval-report/v1` additive until a breaking change is unavoidable, then introduce a new schema version with migration notes.
- Use Ask Byron as evidence for setup ergonomics, not as the sole basis for hard-coded artifact semantics.

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
1. Implement industry coverage audit P0 suites (goal-success, intent-resolution, task-adherence, sensitive-disclosure, agency-boundary)
   - Source of truth: `docs/industry-coverage-audit.md`
   - Unblocks security/governance maturity and closes highest-impact preset gaps
2. Add dedicated multi-turn eval track (`multiturn-trajectory`) across presets, starter datasets, rubrics, and scaffold templates
   - Include turn-sequence assertions for context retention, state consistency, delayed safety checks, and episode-level goal completion
   - Aligns with production agentic-eval practice where failures appear only after turn 2+
3. npm publishing workflow (GitHub Actions for semantic versioning, releases, npm publish)
   - Unblocks teams to `npm install @icodenet/eval-dashboards`
   - Required for Phase 4 unlock

**Short term (Phase 4 preparation, next 2–3 weeks):**
4. Community seeding: early runner partnerships and integration examples
   - Validates adoption readiness
   - Gathers feedback before public announcement

**Medium term (Phase 4 execution, post-npm readiness):**
5. Public npm release + announcement
6. GitHub Actions + Azure DevOps templates for production use
7. Community building (issues, feedback, iterations)

---

## Product philosophy

- **Runner-agnostic core:** No dependency on a single eval harness, LLM vendor, or cloud
- **Artifact-first:** Improving the contract is more important than adding one-off dashboard features
- **Offline by default:** Static reports work without a server
- **Teaching via examples:** The taxonomy is taught through docs, schema, and runnable fixtures—not discovered by trial-and-error

The core idea — an Istanbul-style, offline, artifact-first reporting layer for agent and LLM evals — is timely and differentiated. Finishing Phase 2A + 2B establishes the contract and makes it visible; Phase 3–4 drives ecosystem adoption through community.
