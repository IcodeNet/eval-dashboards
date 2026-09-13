# Roadmap — @icodenet/eval-dashboards

This document captures the prioritized improvement plan for the project.
It complements `docs/STATUS.md` (tactical checklist) and `docs/PRP.md` (original product requirements).

**Last updated:** 2026-09-13

---

## ✅ Phase 1: Fix consistency & polish the foundation (COMPLETE)

- [x] Naming alignment across legacy `eval-reports` references
- [x] Implement `eval-dashboards init` config generation
- [x] Full config loading from `eval-dashboards.config.ts`, `.js`, and `package.json`
- [x] Enforce suite-manifest gate policy thresholds in `check`
- [x] Add GitHub Actions CI workflow (typecheck + test + build + example smoke tests)

**Outcome:** Foundation is solid. Test suite, TypeScript, and CI workflow are green.

---

## ✅ Phase 2A: Strengthen the contract & teach taxonomy (COMPLETE)

The schema is only useful if runners emit it. Phase 2A made taxonomy first-class through docs + examples.

### What's done:
- [x] Export JSON Schema for `eval-report/v1` → `schemas/eval-report-v1.schema.json` (published and maintained in-repo)
- [x] Create `docs/taxonomy.md` → Complete teaching guide with definitions, examples, and checklist
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

## ✅ Phase 3B: Governance Hardening & Output Safety (COMPLETE)

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

## ✅ Phase 4 (Core Shipping & Adoption Infrastructure): COMPLETE

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

## 🚧 Phase 4A: Reference Integration Proving Ground & Setup Layer (PARTIALLY COMPLETE; NEXT SLICES REMAIN)

This phase runs two parallel streams that feed each other:

1. **reference integration stream** proves the package against a real assistant eval program.
2. **eval-dashboards setup-layer stream** turns repeated integration patterns into reusable presets, templates, and guidance.

The schema should remain runner-agnostic and portable. Domain-specific suite names should generally be shipped as documented presets/templates rather than hard-coded schema enums, unless a concept proves broadly reusable across eval programs.

### Stream A: reference integration eval stream

- [x] Inspect the existing reference integration eval runner, datasets, and CI wiring
- [x] Add `@icodenet/eval-dashboards@0.3.0` as an explicit dev dependency
- [x] Map current reference integration eval results into `eval-report/v1`
- [x] Emit `.evals_output/*.json` artifacts from existing eval runs
- [x] Add suite manifests, dataset versions, rubric versions, and dashboard gates
- [x] Wire `eval-dashboards lint`, `check`, and `report` into reference integration workflows
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
   - Explain each term in the context of the artifact contract, setup scaffolding, generated reports, and real integrations such as reference integration.
   - Show how the terms relate: datasets provide cases, suites group cases by intent/risk, and rubrics define the scoring rules and pass/fail expectations.
- [x] Add runner-adapter primitives for teams starting from existing eval results
   - Do not absorb app-specific dataset contracts or exact host-application summary object shapes.
   - Provide portable inputs for run metadata, suite case results, suite manifest defaults, rubric contracts, provenance/lifecycle defaults, and output writing.
   - Helpers compute suite totals from rows so adapters cannot drift into aggregate-only summaries.
   - Keep raw test case data as a project concern; only the normalized row evidence and governance metadata should cross into `eval-report/v1`.
- [x] Capture GitHub approval-gate and dashboard branch pattern as reusable docs/examples
   - Document branch-as-database layout (`main/`, `pr/`, history manifests, `pr-meta.json`) and retention caps.
   - Provide workflow templates for status transitions (`pending` -> `success|failure`) with environment approvals.
   - Provide cleanup workflow template for closed PR data in the publish branch.
- [x] Feed reference integration lessons back into templates before treating them as stable
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

Start with presets, fixtures, docs, and CLI scaffolding. Amend `eval-report/v1` only when reference integration or another real integration proves that a setup concept is portable enough to become part of the shared artifact contract.

### Setup-layer planning slices

These slices turn the reference integration proving-ground work into reusable setup-layer work without baking reference integration-specific suite names into the core contract.

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
- Mark presets experimental until at least reference integration plus one other integration validates the shape.
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
- Avoid hard-coding reference integration suite ids. Use suite presets as optional defaults that can be renamed or overridden by the consuming team.

#### Schema and taxonomy decision rules

- Add schema fields only for concepts that are portable across runners and domains, not for one assistant's suite taxonomy.
- Prefer preset metadata or docs for opinionated setup defaults; use validation/lint rules to teach completeness before making fields required.
- Keep `eval-report/v1` additive until a breaking change is unavoidable, then introduce a new schema version with migration notes.
- Use reference integration as evidence for setup ergonomics, not as the sole basis for hard-coded artifact semantics.

---

## 🚧 Phase 4B: CLI Setup Automation for Agent Evals (EXPANSION OF EXISTING INIT)

This phase focuses on the adoption path where a team installs `@icodenet/eval-dashboards` and asks a local coding agent to bootstrap guardrails, evals, judges, and multi-turn test setup with minimal manual wiring.

Primary product goal:

`eval-dashboards init` should become a practical setup assistant, not only a config generator.

### 4B.1 Expand initializer profiles and setup flags (P0)

- [x] Expand existing `eval-dashboards init --preset=agent-quality` with explicit setup profiles and composable flags, for example:
  - `--preset=agent-quality`
  - `--setup=guardrails,evals,judges,multiturn`
  - `--runner=vitest|jest|node|python`
  - `--ci=github|azure|none`
  - `--dry-run` for preview-only output
- [x] Add CLI shell completion support with install/use examples (bash/zsh/fish), including preset/setup/runner/ci values and command flags.
- [x] Generate profile-specific starter assets together:
  - dataset files
  - rubric contracts
  - suite manifests
  - reporter/check commands
  - CI snippets aligned to selected runner
- [x] Keep all generated outputs taxonomy-complete by default.
- [x] Preserve backward compatibility for existing `init --preset=agent-quality` and `--write/--dry-run` flows.

Acceptance criteria:

- A new repo can run one `init --write` command and immediately run lint/check/report on the generated sample artifact.
- `--dry-run` prints exactly what files and commands would be created without writing to disk.

### 4B.2 Local-agent setup instructions output (P0)

- [x] Add optional generation of a checked-in setup playbook (for example `docs/evals-setup-playbook.md`) that a local coding agent can follow safely.
- [x] Include copy-paste prompts for adding cases, updating rubrics, calibrating judges, and wiring multi-turn suites.
- [x] Include a strict "verify before merge" command block with `lint`, `check`, and `report` commands.

Acceptance criteria:

- A user can hand the generated playbook to a coding agent and get reproducible eval wiring without undocumented repo knowledge.

### 4B.3 First-class importer/adapters from common eval outputs (P0)

- [x] Add import adapters so teams can convert existing outputs into `eval-report/v1` quickly:
  - promptfoo
  - deepeval
  - openevals / agentevals
- [x] Provide adapter CLI entrypoints (for example `eval-dashboards import --from=<tool> --input=<path> --out=.evals_output/...`).
- [x] Preserve source-run metadata in row/run evidence fields.
- [x] Implement importers as thin conversion frontends over existing adapter helpers (`createEvalReportArtifact(...)` / `writeEvalReportArtifact(...)`) to avoid duplicate normalization logic.

Current slice status:
- Promptfoo importer + `eval-dashboards import` command implemented.
- DeepEval importer implemented.
- AgentEvals importer implemented.

Acceptance criteria:

- Each supported importer has fixtures + tests proving valid `eval-report/v1` output and correct suite/row totals.

### 4B.4 Statistical gating mode (P2)

- [x] Add optional confidence-aware regression gates (bootstrap confidence interval over pass-rate deltas vs baseline).
- [x] Keep deterministic threshold gates as default; statistical mode remains opt-in.
- [x] Show confidence context in markdown/html summaries.

Acceptance criteria:

- Same artifact evaluated in deterministic mode vs statistical mode yields clearly explained gate decisions.

### 4B.5 Red-team/guardrail reporting profile (P1)

- [x] Add a guardrail-focused report layout for attack-style suites:
  - category breakdown
  - severity distribution
  - failure pattern grouping
- [x] Map to existing risk areas and avoid tool-specific lock-in.
- [x] Reuse the industry-audit safety taxonomy and preset naming so guardrail reporting does not create a parallel classification layer.

Acceptance criteria:

- Teams running safety/guardrail suites can triage by attack class without custom dashboard code.

### 4B.6 Trace-link fields first, CI-native outputs second (P1)

- [x] Add optional trace reference fields (portable IDs/URLs) in artifacts and render as links where present.
- [x] Keep CI-native machine outputs as a follow-on slice after trace-link fields and import adapters are stable.

Acceptance criteria:

- A failing check can be consumed by standard CI tooling and traced back to row evidence in one hop.

### 4B.7 Human adjudication package (P2)

- [x] Add export/import flow for reviewer adjudication bundles:
  - [x] unresolved rows export
  - [x] reviewer verdict merge-back
  - [x] provenance trail in artifact metadata

Acceptance criteria:

- Teams can run human review loops without adopting a hosted platform.

### 4B.8 Cost-quality frontier and benchmark packs (P2)

- [x] Add optional cost/latency-quality frontier views when row metrics are present.
- [x] Add versioned benchmark pack templates (for example safety, tool-routing, groundedness bundles) with compatibility guidance.

Acceptance criteria:

- Users can compare quality vs cost trade-offs and bootstrap standardized packs with stable version metadata.

### 4B execution order

1. 4B.1 Initializer profiles and setup flags
2. 4B.2 Local-agent setup instructions output
3. 4B.3 Import adapters
4. 4B.6 Trace-link fields (portable optional IDs/URLs)
5. 4B.5 Red-team/guardrail reporting profile
6. 4B.4 Statistical gating mode
7. 4B.7 Human adjudication package
8. 4B.8 Cost-quality frontier and benchmark packs

---

## 🚧 Phase 4C: Product Docs Website + Interoperability Guides (NEW)

This phase creates a public product docs site (GitHub Pages) focused on adoption. It explains how to install and use `@icodenet/eval-dashboards`, and how to combine it with existing eval tooling instead of replacing everything.

Primary product goal:

Make onboarding and ecosystem fit obvious in one place: setup path, CI path, taxonomy path, and interoperability path.

### 4C.1 Docs site foundation on GitHub Pages (P0)

- [x] Create a docs-site structure under version control (for example `docs-site/` or equivalent static-docs layout) and publish via GitHub Pages workflow.
- [x] Keep docs fully static and repo-owned (no hosted dependency required).
- [x] Add versioned navigation sections for: Getting Started, CLI, Schema/Taxonomy, CI Gates, Publishing, Integrations.

Acceptance criteria:

- A stable public docs URL exists and is generated from this repository on merge to main.
- Every core CLI command page includes runnable examples.

Implementation recommendation (docs generation stack):

- [ ] Standardize docs generation on a Node-first stack:
  - **VitePress** for product docs pages (guides, onboarding, taxonomy, integrations)
  - **TypeDoc** (optionally via `typedoc-plugin-markdown`) for API reference generation from exported TypeScript surfaces
- [ ] Keep GitHub Pages as the publish target using the existing Actions-based deploy workflow.
- [ ] Reserve Docusaurus for a future migration only if multi-version docs complexity materially exceeds VitePress limits.

Rationale:

- Fits current TypeScript + pnpm toolchain with minimal operational overhead.
- Preserves static, offline-friendly output and repo-owned content.
- Keeps API docs synchronized with source without hand-maintained reference drift.

### 4C.2 CLI-first onboarding path (P0)

- [x] Add a dedicated onboarding journey centered on `eval-dashboards init` + setup flags.
- [x] Document install-and-run flows by runner (`vitest`, `jest`, `node`, `python`) with copy-paste commands.
- [x] Add a local-agent section: safe prompt templates for asking coding agents to wire guardrails, judges, and multi-turn suites.

Acceptance criteria:

- A new team can follow one docs path and reach first passing `lint` + `check` + `report` run without reading internal code.

### 4C.3 Interoperability guides with existing eval ecosystems (P0)

- [x] Add explicit "Works with" pages for major adjacent tools and workflows:
  - promptfoo
  - deepeval
  - openevals / agentevals
  - tracing/observability stacks (for optional trace-link fields)
- [x] For each integration page, document:
  - what that tool does well
  - what eval-dashboards adds
  - minimal conversion path into `eval-report/v1`
  - example commands and expected artifact shape
- [x] Keep positioning runner-agnostic and non-adversarial.

Acceptance criteria:

- Users can identify in under 5 minutes whether they should adopt eval-dashboards alongside their current tooling and exactly how.

### 4C.4 Assistant-UI reference integration track (P1)

- [x] Use assistant-ui integration as the living reference example for agent-eval adoption docs.
- [x] Publish a case-study style walkthrough: baseline setup, emitted artifacts, lint/check/report wiring, dashboard publish flow, and key lessons.
- [x] Keep example aligned with current branch/PR state and update docs when integration steps change.

Acceptance criteria:

- The docs site contains an end-to-end reference integration page tied to real repo artifacts and reproducible commands.

### 4C.5 Adoption measurement for docs effectiveness (P1)

- [x] Add lightweight docs adoption signals (page-to-action checks, integration example usage markers, docs update cadence).
- [x] Track friction points as documentation backlog items, not only product backlog items.

Acceptance criteria:

- Docs changes are prioritized using observed adoption friction instead of intuition only.

### 4C.6 Documentation truth-sync sweep (P0)

- [x] Run a cross-doc consistency pass so roadmap/status/docs/readme/help/examples reflect actual implementation and live site state.
- [x] Remove stale claims about blocked GitHub Pages or cloud publish dry-run-only behavior where implementation is already live.
- [x] Add a docs consistency checklist to release hygiene so stale state claims are caught before merge.

Acceptance criteria:

- No contradictory claims across `README.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/publishing.md`, and `docs/examples.md` for the same capability.
- CLI help text, docs examples, and implementation support matrix are aligned for publish/import/teach flows.

### 4C.7 Supplementary eval tooling map + interoperability expansion (P1)

- [x] Add/expand "Works with" guidance for major eval/observability ecosystems:
  - promptfoo, DeepEval, OpenAI eval surfaces, Anthropic eval methodology,
  - Langfuse, W&B Weave, Arize Phoenix, Braintrust, Ragas, TruLens, Patronus.
- [x] For each guide, document: what the tool does well, tradeoffs, and minimal conversion path into `eval-report/v1`.
- [x] Keep positioning runner-agnostic and non-adversarial (co-existence over replacement).

Acceptance criteria:

- Each integration page includes at least one concrete conversion/adapter pattern into `eval-report/v1`.
- Teams can decide in under 10 minutes whether to pair `eval-dashboards` with their current stack.

### 4C.8 Integration risk register and mitigations (P1)

- [x] Track known integration risks and mitigations in docs:
  - runtime version mismatches,
  - Python-sidecar dependency for some toolchains,
  - schema drift across external outputs,
  - cloud coupling vs offline-first defaults,
  - synthetic-dataset overfitting risk.
- [x] Tie each risk to owner, trigger condition, and mitigation playbook.

Acceptance criteria:

- Risk register exists and is referenced from interoperability docs.
- New integrations cannot be marked complete without explicit risk/mitigation entries.

### 4C.9 Trace-first evidence hardening (P1)

- [x] Strengthen trace-link guidance and examples using `rows[].trace` fields (`traceId`, `spanId`, `traceUrl`, `spanUrl`).
- [x] Add at least one end-to-end example showing failure triage from dashboard row to trace deep link.

Acceptance criteria:

- Report output demonstrates clickable trace evidence on at least one maintained example.
- Docs and maintained examples include trace capture as optional but first-class evidence for agent/tool failures.

### 4C.10 Adopt-now path + existing-runner adoption map (P1)

- [x] Publish `docs-site/v1/adopt-now.html` with a simple copy-paste adoption path that preserves existing runners.
- [x] Publish `docs/adoption-map.md` with candidate PR-style change sets for three known external repos.
- [x] Add non-endorsement disclaimers where external repo candidates are referenced in public docs-site pages.

Acceptance criteria:

- Adopt-now page is linked from the docs-site index and includes a copy-paste flow.
- Adoption map documents candidate-only positioning, evidence anchors, and risk notes.
- Public docs surfaces include non-endorsement language for external candidate repos.

### 4C execution order

1. 4C.1 Docs site foundation
2. 4C.2 CLI-first onboarding path
3. 4C.3 Interoperability guides
4. 4C.6 Documentation truth-sync sweep
5. 4C.4 Assistant-UI reference integration
6. 4C.5 Adoption measurement loop
7. 4C.7 Supplementary tooling map + interoperability expansion
8. 4C.8 Integration risk register
9. 4C.9 Trace-first evidence hardening
10. 4C.10 Adopt-now path + existing-runner adoption map

---

## 🔮 Longer-term ideas (post-v1.0)

- Plugin system for custom reporters (existing custom-reporter-plugin example is a starting point)
- Optional local web-server mode for interactive exploration (pure-static output remains default)
- Deeper risk-area / tool-routing focused views
- Cost / token / latency aggregation when rows carry those fields
- Diff views between any two runs (not just latest-vs-previous)
- AI-powered suggestions for suite manifests and rubric versions based on historical data

---

## 📦 npm release policy note (ship gate)

- npm package history for `@icodenet/eval-dashboards` is immutable; this package cannot be republished "as if first release" under the same name.
- When all remaining roadmap checklist items are complete, and verification passes (`pnpm test`, `pnpm typecheck`, `pnpm build`, plus CLI verifier scripts), publish the first stable milestone as `1.0.0`.
- If a true first-ever release presentation is required, publish under a new package name/scope instead of attempting to reset existing npm history.

---

## 🚧 Phase 4D: Trusted confidence reports and adoption execution (NEW)

Mission

Make eval-dashboards the de facto place to learn evals and produce trusted confidence reports and benchmarks for agents.

Ground-truth inputs for this slice

- Current repository files are the source of truth for all roadmap/docs claims.

Non-negotiables

- Preserve runner-agnostic, artifact-first design.
- Do not break `eval-report/v1` compatibility (additive-only unless explicitly approved).
- No marketing wording; use concrete, testable acceptance criteria.

### 4D.1 Single-truth drift closure (P0)

- [ ] Add schema-generation + schema-drift CI guard slice to roadmap and status.
- [ ] Remove stale line-count, test-count, and completion-state claims across roadmap/status/docs.

Acceptance criteria:

- A generated-schema source path is defined and documented.
- CI fails when generated schema drifts from source model.
- No stale count claims remain in maintained docs surfaces.

### 4D.2 Prioritized execution backlog from review findings (P0)

- [ ] Schema generation from TS + CI drift guard.
- [ ] Ajv/runtime validation hardening with stable error shape.
- [ ] CI-native machine outputs (JUnit, SARIF, GitHub annotations).
- [ ] First-class usage metrics path (tokens/cost/latency).
- [ ] Python emitter/adoption path.
- [ ] Interop adapter expansion (Ragas, Langfuse, Phoenix, Braintrust, OpenAI eval outputs).
- [ ] Judge calibration workflow and measurable agreement reporting.
- [ ] Trace/OTel evidence hardening guidance.

Acceptance criteria:

- Each item has a named owner recommendation, dependency chain, and objective pass/fail checks.

### 4D.3 14-day execution window (exactly 6 items)

1. Schema generation source of truth + CI drift check
   - Suggested owner: core maintainer
   - Dependency: none
   - Acceptance: schema generation command exists; CI fails on drift
2. Stable validation error contract (Ajv/runtime)
   - Suggested owner: model/validation maintainer
   - Dependency: item 1
   - Acceptance: deterministic error shape documented + tested
3. CI machine output v1 (`--json-out` baseline + annotation mapping)
   - Suggested owner: CLI/gates maintainer
   - Dependency: item 2
   - Acceptance: one-hop row anchors emitted for newly failing rows
4. Docs truth-sync sweep for stale claims
   - Suggested owner: docs maintainer
   - Dependency: items 1-3
   - Acceptance: roadmap/status/help/examples consistent by grep evidence
5. Extend adopt-now path with per-runner walkthroughs and richer validation examples (base path delivered in 4C.10)
   - Suggested owner: docs/adoption maintainer
   - Dependency: item 4
   - Acceptance: at least three runner-specific walkthroughs and validation examples published on top of the base adopt-now path
6. Proofreader + full verification gate for this window
   - Suggested owner: release gatekeeper
   - Dependency: items 1-5
   - Acceptance: stronger-model proofreader verdict + test/typecheck/build green

### 4D.4 45-day execution window (exactly 8 items)

1. JUnit output for check/lint CI consumers
   - Suggested owner: CLI maintainer
   - Dependency: 14-day item 3
   - Acceptance: deterministic JUnit file with failing row linkage
2. SARIF output for code-scanning style surfaces
   - Suggested owner: CLI maintainer
   - Dependency: 45-day item 1
   - Acceptance: SARIF artifact validates and links to row anchors
3. GitHub annotation helper path
   - Suggested owner: CI integrations maintainer
   - Dependency: 45-day items 1-2
   - Acceptance: workflow example emits actionable annotations
4. Usage metrics contract (tokens/cost/latency) and docs
   - Suggested owner: schema/model maintainer
   - Dependency: 14-day items 1-2
   - Acceptance: additive fields documented; reporters surface metrics when present
5. Python emitter path (first-class adoption)
   - Suggested owner: adapters maintainer
   - Dependency: 14-day item 5
   - Acceptance: python example emits valid `eval-report/v1` without manual JSON editing
6. Interop adapter expansion pack
   - Suggested owner: integrations maintainer
   - Dependency: 14-day item 3
   - Acceptance: each adapter has fixture + conversion docs + verification tests
7. Judge calibration workflow hardening
   - Suggested owner: eval methodology maintainer
   - Dependency: 14-day item 2
   - Acceptance: measurable agreement/disagreement and threshold examples in docs/tests
8. Trace/OTel evidence hardening
   - Suggested owner: observability maintainer
   - Dependency: 14-day items 3 and 5
   - Acceptance: maintained end-to-end example from failing row to trace deep link

### 4D.5 Risk register entries (critical/high)

1. Schema drift risk (critical)
   - Risk if ignored: contract divergence between model and published schema
   - Trigger signals: validator/schema mismatch, docs disagree with runtime
   - Mitigation: generated-schema source + CI drift gate
2. Unstable validation surface (high)
   - Risk if ignored: non-deterministic CI behavior and hard-to-debug failures
   - Trigger signals: same bad input yields different error text/shape
   - Mitigation: stable structured error contract + tests
3. Missing CI-native outputs (high)
   - Risk if ignored: gates fail without actionable pointers in CI systems
   - Trigger signals: CI failures with no row-level mapping
   - Mitigation: json/junit/sarif outputs with row anchor links
4. Weak usage-metrics path (high)
   - Risk if ignored: teams cannot evaluate quality/cost/latency trade-offs
   - Trigger signals: decision docs omit cost/latency evidence
   - Mitigation: additive metrics fields + reporter/docs coverage
5. Interop stagnation risk (high)
   - Risk if ignored: adoption stalls in teams with established toolchains
   - Trigger signals: repeated manual conversion workarounds
   - Mitigation: adapter expansion with tested fixtures and docs

### 4D.6 Discoverability constraints

- Keep top-level README docs-site entry prominent.
- Keep roadmap/status/publishing/examples/help surfaces synchronized per release gate.

**Immediate (next 1–2 weeks):**
1. Expand dataset-governance and import quality checks now that 4C.6-4C.9 docs slices are complete

**Short term (next 2–3 weeks):**
2. Continue dataset-governance hardening in lint/check preflight

**Medium term:**
3. External adoption push and community feedback loop

---

## Product philosophy

- **Runner-agnostic core:** No dependency on a single eval harness, LLM vendor, or cloud
- **Artifact-first:** Improving the contract is more important than adding one-off dashboard features
- **Offline by default:** Static reports work without a server
- **Teaching via examples:** The taxonomy is taught through docs, schema, and runnable fixtures—not discovered by trial-and-error

The core idea — an Istanbul-style, offline, artifact-first reporting layer for agent and LLM evals — is timely and differentiated. Finishing Phase 2A + 2B establishes the contract and makes it visible; Phase 3–4 drives ecosystem adoption through community.
