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
- [x] Azure Static Web Apps dry-run validation path implemented (non-dry-run execution path pending)
- [x] Azure Storage publishing adapter implemented (dry-run and execution paths)
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
- [x] npm publishing workflow (manual `workflow_dispatch` publish). Audit 2026-09-14: `publish.yml` and `release.yml` are `workflow_dispatch`-only; there is no `push: tags` trigger, so tag-triggered publishing is not implemented.
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
- [ ] Add `@icodenet/eval-dashboards` as an explicit dev dependency in the reference integration repo. Audit 2026-09-14: unverifiable from this repo — no external commit/PR link recorded. Re-mark only with a link to the external change.
- [x] Map current reference integration eval results into `eval-report/v1`
- [x] Emit `.evals_output/*.json` artifacts from existing eval runs
- [x] Add suite manifests, dataset versions, rubric versions, and dashboard gates
- [x] Run `eval-dashboards lint`, `check`, and `report` against the reference integration. Audit 2026-09-14: commands were run manually and are documented; they are not wired into a committed CI workflow in the reference repo.
- [x] Add rubric contracts plus row provenance/lifecycle metadata
- [ ] Surface the generated `/eval-dashboard/` report in the host app instead of a bespoke summary-card dashboard. Audit 2026-09-14: contradicted by `docs/case-studies/assistant-ui/README.md` — adapter and CLI wiring exist in a local worktree only and no PR has been opened.
- [x] Generate a first dashboard baseline locally and document initial quality gaps. Audit 2026-09-14: the quality-gap findings are substantive; no published baseline URL or committed baseline history manifest exists.

### Stream B: eval-dashboards setup-layer evolution

- [x] Publish TypeScript declaration files for package consumers (`dts: true` in `tsup.config.ts`; `main`/`types`/`exports` in `package.json`). Audit 2026-09-14: the packed-package consumer smoke test named in this slice is still missing — the downstream compile was a one-off manual check, not a checked-in test.
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
- [x] Preserve source-run metadata in run evidence fields (`importSource`, `importInputPath`). Audit 2026-09-14: row-level provenance is constructed by each importer but `mapRow` forwards only `caseResult.metadata`, and no test asserts row `sourceRef` survives into the emitted artifact.
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
- Every core CLI command page includes runnable examples. Audit 2026-09-14: unmet — `docs-site/v1/cli.html` is a single combined page, not per-command pages.

Implementation recommendation (docs generation stack):

- [x] Record docs stack decision for the current milestone: keep the repo-owned static docs-site (`docs-site/v1/*.html`) as production, with migration to VitePress + TypeDoc deferred until explicit revisit triggers are met.
- [x] Keep GitHub Pages as the publish target using the existing Actions-based deploy workflow.
- [x] Reserve Docusaurus as a future migration fallback only if multi-version docs complexity materially exceeds the static-site path.

Decision reference: `docs/docs-site-stack-decision.md`

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
- [ ] Keep example aligned with current branch/PR state and update docs when integration steps change. Audit 2026-09-14: no sync mechanism, CI check, or dated sync record exists, so this cannot be evidenced. Needs either a scheduled check or a dated review log.

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
- [x] Add a docs consistency checklist to release hygiene so stale state claims are caught before merge. Evidence: `CHECKS_LEDGER.md:13-42` section "1a) Docs Consistency Checklist (completion-claim gate)" — requires `path:line` evidence in the commit message before any `- [ ]` becomes `- [x]`, and rules out external-repo, docs-only, and unfalsifiable process claims.

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

- Each integration page includes at least one concrete conversion/adapter pattern into `eval-report/v1`. Audit 2026-09-14: partially met — all pages point at the same generic mapper, which records `--source` in metadata but does not apply per-tool field mappings.
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
- New integrations cannot be marked complete without explicit risk/mitigation entries. Audit 2026-09-14: stated as a prose convention in `docs/integrations/risk-register.md`; nothing enforces it in lint or CI.

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

## 🚧 Phase 4E: Trust hardening for CI gating and eval methodology (NEW)

Mission

Close the gaps identified by an external architect + methodology review before recommending eval-dashboards as the standard evals layer for agent teams building on shared CI/CD infrastructure. Stay a runner-agnostic, offline-first reporting/gating toolkit — do not expand into a hosted observability platform (that is a separate, explicitly out-of-scope decision; see "Non-goals for this phase" below).

Review inputs

- Staff Platform/DevOps Architect review (2026-09-13): CI-native outputs and gate primitives are strong; missing alerting, gate-reliability telemetry, and adjudication/dataset rigor before broad rollout.
- Senior AI/ML Evaluation Methodologist review (2026-09-13): taxonomy/gating primitives are strong; calibration enforcement, multi-reviewer adjudication defaults, and dataset governance are the top trust gaps; curriculum teaches mechanics more than judgment.

### 4E.1 Alerting adapters (P0, S)

- [x] Add notification adapters for gate failure / trend regression: Slack webhook, Teams webhook, generic email/SMTP.
- [x] Ship as opt-in CLI flags/config (for example `check --notify=slack --notify-webhook=<url>`), independent of hosting decisions.

Acceptance criteria:

- A blocking gate failure or a newly-blocked baseline can trigger at least one notification channel without custom scripting.
- Notification payload includes run id, failing suite(s), and a link back to the published report or artifact path.

### 4E.2 Gate reliability heartbeat (P0, S)

- [x] Emit a machine-readable gate-run status (`ran` | `skipped` | `errored`) alongside existing `check` outputs.
- [x] Document how to wire this heartbeat into existing CI monitoring so a silently skipped/errored gate is itself an alertable signal.

Acceptance criteria:

- A CI job where `check` errors non-fatally or is skipped produces a distinguishable status from a clean pass, and this is documented with an example.

### 4E.3 Mandatory pre-gate calibration check (P0, M)

- [x] `check` refuses to run a `blocking` gate against a suite with judge-calibration configured unless an independent calibration run exists within a configurable recency window and matches the current `judgeModel` plus the configured calibration-suite rubric contract.
- [x] Default behavior on missing/stale calibration: warn loudly in report-only mode, fail in blocking mode (configurable escape hatch documented).

Acceptance criteria:

- A blocking judge-scored suite with no matching recent calibration run fails `check` with an actionable message naming the missing calibration evidence.

### 4E.4 Multi-reviewer adjudication as the default (P0, M)

- [x] Require ≥2 independent reviewers for calibration ground truth by default; single-reviewer mode becomes an explicit opt-down flag, not the default path. (`src/adjudication/bundles.ts:255-270`: `mergeAdjudicationBundle` skips rows with `skippedInsufficientReviewers` unless `--allow-single-reviewer` / `allowSingleReviewer: true` is passed; CLI flag wired in `src/cli/index.ts:1177-1180`.)
- [x] Report inter-rater disagreement rate alongside judge agreement/disagreement in artifacts and reporters. (`src/adjudication/bundles.ts:281-297,352-368`: per-row `adjudicationDisagreements` and overall `disagreementRate`/`interRaterAgreement` recorded in `MergeAdjudicationResult` and `report.metadata.adjudication.imports[].interRaterAgreement`; surfaced in CLI import summary at `src/cli/index.ts:1191-1197`.)

Acceptance criteria:

- Default `init --setup=judges` scaffolding and docs demonstrate two-reviewer adjudication; single-reviewer mode is documented as an explicit reduced-rigor opt-out. (`exportUnresolvedRowsBundle` in `src/adjudication/bundles.ts:151` emits `reviews: [{}, {}]` by default; `src/cli/init-scaffold.ts:278-283,752` teach-mode/prompt copy documents the two-reviewer default and the `--allow-single-reviewer` opt-out.) Verified via `npx vitest run` (216/216 passing, including new `test/adjudication.test.ts` cases for agree/disagree/single-reviewer paths) and `npx tsc --noEmit` (clean).

### 4E.5 Dataset governance hardening (P1, M)

- [x] Add `lint` checks for duplicate dataset case ids, orphaned `scenarioId` references, and minimum coverage-per-category warnings.
- [x] Document these checks in the dataset governance section of the taxonomy docs.

Acceptance criteria:

- `lint` fails or warns (configurable strictness) on a fixture containing duplicate case ids or orphaned scenario references.

### 4E.6 Ship scoped P1 security presets (P1, M)

- [x] Implement `output-handling-safety` and `prompt-leakage-resilience` presets already scoped in `docs/industry-coverage-audit.md`.
- [x] Split `content-safety`-style guidance into category-specific suites (violence, self-harm, hate/harassment) rather than one undifferentiated bucket.

Acceptance criteria:

- Each new preset has dataset/rubric templates, gate defaults, and scaffold output parity with existing presets.

### 4E.7 "Diagnose a red run" exercise (P1, S)

- [x] Add an 11th teach-exercise workbook (`docs/teach-exercises/11-diagnose-a-red-run.md`) built around a pre-authored failing artifact combining a blocked baseline, a statistical gate failure, and flaky rows.
- [x] Walk the learner through root-causing each failure type distinctly, not just re-running until green.

Acceptance criteria:

- The exercise ships its own fixture artifact and expected diagnostic conclusions the learner can check their answer against.
  Shipped: `docs/teach-exercises/11-diagnose-a-red-run.md` (150 lines), linked from
  `docs/teach-curriculum.md:54`, ships its own fixture and walks blocked-baseline,
  statistical-gate, and flaky-row failures as distinct root causes.

### 4E.8 Product-owner / non-engineer reading track (P1, S)

- [x] Add a 2-exercise mini-track for reading the HTML dashboard: interpreting severity, taxonomy-completeness score, and a baseline-blocked banner — no CLI/JSON authoring required.
- [x] Link this track from `docs/teach-curriculum.md` as an alternate on-ramp for product managers and reviewers.

Acceptance criteria:

- A non-engineer can complete the track using only a browser and a provided sample report, reaching correct conclusions about pass/fail and drift status.
  Shipped: `docs/teach-exercises/pm-01-reading-a-report.md` (116 lines) and
  `docs/teach-exercises/pm-02-reading-drift.md` (113 lines), both linked from
  `docs/teach-curriculum.md:57-58` under a "Non-engineer reading tracks" section.

### 4E.9 Complete coded import adapters (P2, M)

- [x] Ragas and Langfuse portions: real coded `import` adapters (`--from=ragas`, `--from=langfuse`) with fixtures and passing tests, matching the existing promptfoo/deepeval/openevals pattern.
- [ ] Phoenix and Braintrust portions: not started. Still docs-only conversion notes, no coded adapter, fixture, or test yet.

Acceptance criteria:

- Each converted adapter has a fixture, a passing test proving valid `eval-report/v1` output, and correct suite/row totals, matching 4B.3 acceptance criteria.
- Status: 2 of 4 sources (ragas, langfuse) meet this bar; phoenix and braintrust remain open.


### 4E.10 JSONL import ingress for eval migration paths (P1, S)

- [x] Allow `eval-dashboards import` to accept newline-delimited JSON (`.jsonl`) inputs in addition to JSON objects/arrays, so teams can ingest line-oriented exports without pre-conversion.
      `parseJsonFile` in `src/cli/import-adapters.ts` now falls back to
      line-by-line JSON.parse when the whole-file parse fails, with a clear
      error naming the offending line if a line isn't valid JSON either.
      Help text and `docs/cli-help/import.txt` updated to say JSON/JSONL.

Acceptance criteria:

- A JSONL fixture imports through at least one adapter path and emits a valid `eval-report/v1` artifact with correct row/suite totals.
      Verified: `test/import-adapters.test.ts` "imports newline-delimited
      JSON (JSONL) rows" — 2-row promptfoo JSONL fixture imports, validates
      as `eval-report/v1`, row ids and provenance metadata correct. Full
      suite 209/209, typecheck clean, build clean.

Rationale: OpenAI's eval workflow documentation explicitly uses uploaded JSONL datasets and teams migrating off hosted eval surfaces increasingly handle line-oriented artifacts first (`https://developers.openai.com/api/docs/guides/evals`).

### Non-goals for this phase

- Hosted ingestion API, time-series store, auth-gated dashboard app, and cross-repo/team rollup views are explicitly out of scope for 4E. They require a separate, explicitly resourced platform decision (see review verdict: pair with an existing hosted observability product, or fork into a new service with its own team/SLA) and must not be bolted on incrementally under this phase.

### 4E execution order

Revised after the 2026-09-14 multi-role review (see Phase 4F review inputs). Ordering is by adoption impact, not by item number.

1. 4E.1 Alerting adapters — done
2. 4E.2 Gate reliability heartbeat — done
3. 4E.3 Mandatory pre-gate calibration check — done; still to surface calibration age/agreement on the HTML report face
4. 4E.5 Dataset governance hardening — done (duplicate dataset case ids, orphan scenario references, and low category coverage warnings shipped in lint + docs). Follow-up extension: dataset-staleness and required-taxonomy-field checks.
5. 4E.7 Diagnose-a-red-run exercise — cheapest antidote to "rerun until green"
6. 4E.8 Product-owner reading track — pair with the 4F.1/4F.2 confidentiality work before promoting a non-engineer view
7. 4E.6 Scoped P1 security presets — build in loss-given-failure order: `output-handling-safety`, then `prompt-leakage-resilience`, then category-split content safety
8. 4E.9 Complete coded import adapters — decide by surveying which runners teams actually use; promote sharply if Ragas/Langfuse/Phoenix/Braintrust are in real use
9. 4E.4 Multi-reviewer adjudication — done as the default path, with `--allow-single-reviewer` as the explicit opt-down for teams that can't yet afford two-reviewer ground truth on every calibration run.

Related follow-up captured in 4F: the statistical gate knobs (`--confidence-level`, `--bootstrap-samples`) are over-exposed. A misconfigured statistical gate is worse than a blunt one; prefer one opinionated preset over raw knobs.

---

## 🚧 Phase 4G: Teaching curriculum consistency (NEW)

Mission: the teaching track is the adoption funnel. An independent review on
2026-09-14 executed all 19 files in `docs/teach-labs/` and `docs/teach-exercises/`
and found the set is bimodal — four strong files and fifteen thin ones — plus
several commands that do not do what the docs say. Fix the broken commands
first, then normalise the rest onto the format the four strong files already use.

Reference files (the bar, no changes needed): `teach-labs/04-release-readiness.md`,
`teach-labs/05-post-release-monitoring.md`, `teach-exercises/11-diagnose-a-red-run.md`,
`teach-exercises/pm-01-reading-a-report.md`.

### P0 — broken commands (a learner following instructions exactly hits these)

- [x] 4G.1 Fix `07-judge-calibration.md`: the exercise's own row fails `lint` with
      `missing-row-lifecycle` and `missing-row-provenance` (exit 1) while the doc
      claims "Commands run without schema errors" (`docs/teach-exercises/07-judge-calibration.md:89-90`).
      Root cause is cross-file: Ex05 adds `suiteManifests`, promoting the suites to
      dataset-governed, which makes provenance/lifecycle mandatory in Ex07. Either
      add the required fields or teach the error as the lesson. Acceptance: the
      exercise runs clean, or the failure is the documented teaching point.
      Fixed by adding `metadata.lifecycle.status`/`metadata.provenance.source` to
      both new rows and explaining why Ex05's manifest requires them. Verified by
      running Ex02→04→05→07 verbatim from the doc in a clean scratch dir: exit 0,
      warnings only.
- [x] 4G.2 `history --history-dir` was a non-existent flag, silently ignored, that
      wrote to the default path while appearing to work. Fixed two ways: the doc now
      uses `--out` (`docs/teach-exercises/11-diagnose-a-red-run.md:66`), and the CLI
      now rejects unknown flags with exit 2 (`src/cli/args.ts` `assertKnownFlags`,
      19 tests in `test/cli-args-validation.test.ts`). Commit `e562b1f`.
- [x] 4G.3 Fix `08-gates-release.md`: the doc primes the learner to expect a failing
      `check` (exit 1) but the minimal artifact has one passing row, so the gate
      passes and exits 0. Either change the fixture or change the text.
      Fixed by keeping the real pass (exit 0) as step 1 and adding step 2: append
      one critical failing row and show the real exit-1 output, so the learner sees
      both outcomes instead of a false claim. Verified against a real run in both
      states.
- [x] 4G.4 Fix `05-suite-taxonomy.md`: it adds manifests for `refusal-safety` and
      `answer-quality`, neither of which exists in the artifact, while the one suite
      that does exist (`quality`) gets none — so lint goes from clean to
      `missing-suite-manifest`. Doing the exercise correctly makes lint worse and the
      doc says nothing. Also the origin of the Ex05 → Ex07 trap in 4G.1.
      Fixed by dropping the invented `refusal-safety` manifest and keeping only
      `answer-quality` (the real suite Ex07 adds next), with an explicit note that
      manifesting an existing suite like `quality` retroactively would make its rows
      require lifecycle/provenance metadata — deferred, not silently triggered.
      Verified the full Ex02→04→05→06→07 chain end-to-end from the actual doc
      scripts: exit 0 throughout, output matches what each file now documents.
- [x] 4G.5 Fix the dangling `pm-02-reading-drift.md` link in `pm-01-reading-a-report.md`:
      write the file or drop the reference. "Reading track A" also implies a track B
      that does not exist.
      Wrote `docs/teach-exercises/pm-02-reading-drift.md`: a two-report comparison
      (run-003 healthy 92.3% vs run-004 red 61.5%) teaching that a pass-rate delta
      is not the same as a confirmed regression count when the baseline is blocked.
      Verified both header strips and baseline chips against real generated HTML
      (`Baseline compatible` / `Baseline blocked`) before writing them into the doc.
- [x] 4G.6 Fix `fde-role-workflow.md`: steps 1-5 run `npx eval-dashboards` against a
      hypothetical customer repo, so none of them are runnable as written.
      Re-verified all 5 steps plus the practical-lab fixture script end-to-end in a
      clean scratch dir: every command actually runs and exits 0 against the real
      `init --preset=agent-quality --write` fixture — the commands were already
      correct. The real gap was hygiene: nothing told the reader to run this
      outside a real customer repo or this checkout. Added an explicit note before
      the task loop pointing at the scratch-directory rule.

### P1 — the curriculum contradicts its own best work

- [x] 4G.7 Index the two best exercises. `docs/teach-curriculum.md` does not
      reference `11-diagnose-a-red-run.md` or `pm-01-reading-a-report.md` at all
      (verified: zero matches), so they are unreachable from the curriculum index.
      Added both, plus the new `pm-02-reading-drift.md`, to `docs/teach-curriculum.md`
      under a new "Non-engineer reading tracks" section.
- [x] 4G.8 Replace the placeholder expected-result string. "Commands run without
      schema errors. Artifact is updated as described in the goal." appears verbatim
      in four exercises and is factually false in Ex07. Replace each with verbatim
      real output, as Labs 04/05 do. Acceptance: no file contains the placeholder.
      Fixed in all four files (05, 06, 07, 10) with real verified command output.
      Confirmed zero remaining matches across `docs/teach-exercises/` and
      `docs/teach-labs/`.
- [x] 4G.9 State the prerequisite chain. Every exercise carries identical
      boilerplate that never names its real dependency. The actual chain
      (Ex02 → Ex04 → Ex05 → Ex06 → Ex07 → Ex09 → Ex10) mutates one shared artifact,
      which is why Ex05 silently breaks Ex07. Name the real prerequisite per file.
      Added a specific "Finish Exercise N" line per file (02, 04-10) naming its
      real predecessor and what it inherits, plus a chain summary in
      teach-curriculum.md's "Exercise rules".
- [x] 4G.10 Add an artifact-hygiene rule: exercises run in a scratch directory,
      never the repo root. Ex03 runs `init --write`, dropping five files including a
      workflow snippet into the working directory, and labs/README tells learners to
      work inside the checkout. Reviewers and learners both polluted the repo this way.
      Added a scratch-directory rule to teach-curriculum.md's "Exercise rules"
      with a concrete `mkdir -p /tmp/... && cd ...` example.
- [x] 4G.11 Reframe `10-iteration-loop.md`. Its "fix" is editing `passed: false` to
      `passed: true` in the artifact — falsifying evidence, the exact behaviour this
      package exists to prevent. Needs a loud framing that this simulates a rubric
      change and is never done to a real run. Highest-risk content in the set.
      Added an explicit warning before the steps: this method is legitimate only
      when the underlying rubric was wrong and is being hand-edited solely because
      the exercise has no live runner; a real pipeline re-runs the suite instead.
      Verified `check --min-pass-rate=0.9 --zero-critical` still exits 0 after the
      edit and change note, from a clean scratch dir.

### P2 — normalise the remaining files

- [x] 4G.12 Apply the section template from the four reference files to the fifteen
      thin ones: what this teaches (numbered ideas), why this matters, question this
      answers, named prerequisites, where to run it, per-step rationale, verbatim
      expected output, how-to-read-it table, common mistakes, definition of done.
      Applied "what this teaches" / "question this answers" / "common mistakes" to
      13 files (docs/teach-exercises/01,02,03,04,05,06,08,09,10 and
      docs/teach-labs/01,02,03,fde-role-workflow.md); prerequisites and
      why-this-matters were already present pre-batch. 09-reports-history.md and
      04-release-readiness.md (reference) also got a "how-to-read-it" table; the
      remaining files still lack that specific table element — tracked as a
      follow-up, not silently dropped. All additions were prose-only; no existing
      shell command or documented output was changed. 209/209 tests passing after
      each batch.
- [x] 4G.13 Teach `disappeared` properly. Three separate labs print `disappeared= 4`
      and none explains that it is ID churn rather than four fixed bugs — a reviewer
      reading the fixture cold concludes "nothing changed", which is wrong.
      Fixed in Labs 01 and 03 (05 already handled this correctly from an earlier
      batch): named the real ids (`rq-fail-2`, `rq-fail-4`, `tu-fail-1`,
      `tu-fail-2`), stated explicitly that `disappeared` != improvement, and
      that only `newlyPassing` is a confirmed fix.
- [x] 4G.14 Teach where thresholds come from. Lab 02 uses 0.95 and 0.99 against a
      fixture at 0.973 without saying the thresholds were chosen to straddle it. A
      threshold is a negotiated risk position, not a constant.
      Added a "Why these two thresholds" section to Lab 02 stating the actual
      pass rate (97.33%) and that 0.95/0.99 were chosen to straddle it on
      purpose, plus the explicit warning not to copy these numbers as a real
      policy. Re-verified both `check` invocations still pass/fail as before.
- [x] 4G.15 Use the "four evidence classes" spine (history / progress / gate /
      row detail) from labs/README to label every lab step. Declared once, never used.
      Labeled every numbered step in Labs 01, 02, 03 with its evidence class(es).
- [x] 4G.16 Surface `--min-matched-expectation-rate`. Ex03 introduces `expectation`
      as "one extra field" and never mentions the gate that consumes it.
      Clarified that the dataset's `expectation` field is distinct from the
      artifact's `expectedOutcome` field the gate actually reads; added a new
      step 4 that converts the 4 rows into an artifact with one deliberate
      mismatch and runs `check --min-matched-expectation-rate=1.0`. Also fixed
      a real bug found while verifying: the scaffold JSONL has no trailing
      newline, so a plain `cat >>` corrupts the file by gluing lines together —
      added `printf '\n' >>` before the append. Verified end-to-end from a
      clean scratch dir: exact matched-expectation-rate 0.750, exit 1.

---

## 🚧 Phase 4F: Evidence, confidentiality, and org rollout (NEW)

Mission

Make eval results defensible as evidence and safe to publish, and make multi-agent rollout legible to product and leadership — without becoming a hosted platform. Every item here is an artifact field, a lint rule, a CLI flag, or a static output. The charter forbids hosting; it does not forbid evidence.

Review inputs (2026-09-14, four independent role reviews)

- Staff Platform/DevOps Architect: CI-native outputs are strong; no alerting, no gate telemetry, no rollup.
- Senior AI/ML Evaluation Methodologist: calibration enforcement and dataset governance are the top methodology gaps.
- Principal Engineering Manager / Head of AI Platform: the emitter is the adoption tax, not the dashboard; cross-agent trends and bypass accounting are the month-2/3 walls; leadership cannot trust a gate whose bar the gated party can lower.
- Principal Security & Governance Architect: the published-report model is a data-egress failure independent of HTML escaping; gate results are self-attested and therefore inadmissible as audit evidence.

Consensus blockers: cross-agent rollup does not exist; published reports have no access control and no redaction; gate evidence carries no resolved config, no versions, no digests, and no signature.

### 4F.1 Two-tier artifact split (P0, 5-8 d)

- [x] Split emitted artifacts into a public tier (counts, rates, ids, categories, severities, verdicts, versions) and a sensitive tier (prompts, model outputs, retrieved chunks, judge reasoning).
- [x] Publish targets consume the public tier by default; the sensitive tier stays in the controlled store.

Acceptance criteria:

- A publish run against an artifact containing evidence text emits only the public tier, and the sensitive tier is verifiably absent from the published output.

### 4F.2 Redaction profile and publish preflight (P0, 4-6 d)

- [x] Add a `--redact` deny-by-default profile: evidence text fields are dropped unless explicitly allow-listed per suite. Regex/entity PII detection is a secondary net, never the primary control.
- [x] Publish preflight hard-fails when evidence fields are present in the payload, with an explicit `--allow-sensitive-publish` override recorded in the run record.
- [x] Record the applied `redactionProfile` in the run record.

Acceptance criteria:

- Publishing an artifact with unredacted evidence fails without the override, and the override's use is visible in the resulting run record.

### 4F.3 `eval-check-result/v2` provenance fields (P0, 3-4 d)

- [x] Extend the check-result payload with: fully resolved gate configuration, per-suite `datasetVersion` and `rubricVersion`, sha256 digests of every input artifact, subject (commit SHA / release / image digest), and CI environment (provider, run id, run URL, actor).

Acceptance criteria:

- An auditor can read a single check-result file and determine which thresholds were in force, against which dataset and rubric versions, for which commit — without reading workflow YAML at that commit.
  - Evidence: `eval-dashboards check --json-v2-out=<path>` writes `eval-check-result/v2`
    (`src/cli/index.ts:251-373` builds `resolvedGateConfig`, `suiteProvenance`, `artifactDigests`,
    `subject`, `ciEnvironment`; `src/cli/index.ts:1575-1591` wires it into the `check` command).
    `--json-out`/`eval-check-result/v1` is unchanged (same object, `Omit<..., 'schemaVersion'>`
    base type). Covered by `test/cli-check-json-v2-output.test.ts`. Documented in
    `docs/artifact-format.md` and `docs/cli-help/check.txt`.

### 4F.4 Artifact digest and detached signature (P0, 4-6 d)

- [x] Hash artifacts and gate results; emit a detached signature using cosign keyless via CI OIDC.
- [x] Add a `verify` command that re-validates digest and signature.

Acceptance criteria:

- A hand-edited check-result claiming `passed: true` fails `verify`, and a genuine one passes with its producing workflow, repo, and commit identifiable from the signature.
  - Evidence: `eval-dashboards sign --artifact=<path> [--out=<path>]` hashes (sha256) the
    artifact and writes an `eval-check-signature/v1` record (`src/sign/sign.ts`). In CI with
    a Sigstore/Fulcio OIDC token, it shells out to `cosign sign-blob --yes --bundle` for a
    real keyless signature and embeds the bundle (workflow/repo/commit identifiable via the
    Fulcio certificate + Rekor entry inside the bundle). cosign is not installed in this
    sandbox and keyless signing requires a CI OIDC token it cannot obtain locally, so here it
    gracefully degrades to `method: "unavailable"` with a explicit reason instead of failing
    or fabricating a signature — never silently claiming a signature that isn't real.
    `eval-dashboards verify --artifact=<path> [--signature=<path>]` (`src/cli/index.ts`)
    re-hashes the artifact, fails closed on digest mismatch (hand-edited artifact) and on
    `method: "unavailable"`/missing signatures, and shells out to `cosign verify-blob` for
    real `cosign-keyless` bundles. Covered by `test/sign.test.ts` and
    `test/cli-sign-verify.test.ts` (digest-mismatch rejection, missing-signature rejection,
    graceful local degradation). CLI help snapshots: `docs/cli-help/sign.txt`,
    `docs/cli-help/verify.txt`.

### 4F.5 Waiver and exception register (P1, 5-7 d)

- [x] Support a waiver file recording suite/row, justification, risk owner, ticket reference, and expiry date (`src/gates/waivers.ts` `WaiverV1`/`loadWaiverRegister`).
- [x] `check` honours active waivers, reports them prominently, and fails on expired waivers (`src/cli/index.ts` wiring via `applyWaivers`, `--waiver-file`/`waiverFile` config; `test/waivers.test.ts`, `test/cli-check-waivers.test.ts`).

Acceptance criteria:

- A release with a known failure can ship via a recorded, expiring waiver instead of a disabled gate; an expired waiver fails the gate.

Note: waiver files are plain JSON, not signed (the register's own integrity relies on repo/PR review, same trust boundary as gate config); "signed" as literally cryptographically signed is not implemented and would need `sign`/`verify`-style detached signatures layered on top if required later.

### 4F.6 Threshold-change detection (segregation of duties) (P1, 3-4 d)

- [ ] Detect when resolved gate configuration loosens relative to the baseline; fail the gate or require CODEOWNER approval.
- [ ] Surface the loosening in `check --json-out` so it is visible in both the diff and the artifact.

Acceptance criteria:

- A PR that lowers `minPassRate` while introducing failures cannot pass on its own authority.

### 4F.7 Heartbeat verifier (P1, 2-3 d)

- [ ] Add a scheduled verification path asserting that every release subject has a fresh heartbeat within N hours; absence raises an alert.

Acceptance criteria:

- Deleting or skipping the gate step on a release produces an alert rather than silent success. Absence of evidence becomes detectable.

### 4F.8 Static org rollup index (P1, M)

- [ ] Render a single offline overview from N published history artifacts across repos: pass rate, critical failures, and baseline drift per agent over time.
- [ ] Remains a static, offline-first output — no server, no ingestion API, no auth system.

Acceptance criteria:

- With three or more agent repos publishing history, one generated page answers "which agent regressed this week" without opening each repo's site.

### 4F.9 Bypass accounting (P1, S)

- [ ] Count and report use of `--allow-blocked-baseline`, `--allow-stale-calibration`, and `--allow-sensitive-publish` as a first-class org metric in history and rollup views.

Acceptance criteria:

- Gate erosion over time is visible as a trend rather than discovered during an audit.

### 4F.10 PR-subset vs full-suite tiering with cost budget (P2, M)

- [ ] Add a first-class concept of a fast PR subset versus a full scheduled suite, with judge cost and runtime reporting per run.

Acceptance criteria:

- A team can keep PR gating under an explicit time and cost budget instead of moving the gate to nightly and losing PR protection entirely.

### 4F.11 Evidence export bundle (P2, 3-4 d)

- [ ] Produce one signed bundle per release containing report, gate result, active waivers, approval trail, and a manifest.

Acceptance criteria:

- A single artifact can be handed to an examiner and independently verified.

### Still out of scope in 4F

- Hosted ingestion API, time-series store, auth-gated dashboard app, and multi-tenant service remain non-goals. Access control, durable per-run URLs, and live dashboards should be solved by pairing with an existing hosted product or by a separately resourced component with its own owner and SLA — not by growing a service inside this package.

### 4F execution order

1. 4F.1 Two-tier artifact split
2. 4F.2 Redaction profile and publish preflight
3. 4F.3 `eval-check-result/v2` provenance fields
4. 4F.4 Artifact digest and detached signature
5. 4F.5 Waiver and exception register
6. 4F.6 Threshold-change detection
7. 4F.7 Heartbeat verifier
8. 4F.8 Static org rollup index
9. 4F.9 Bypass accounting
10. 4F.10 PR-subset tiering with cost budget
11. 4F.11 Evidence export bundle

Until 4F.1 through 4F.4 ship, the honest guidance is: do not publish reports produced from production data.

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

- [x] Add schema-generation + schema-drift CI guard slice to roadmap and status.
- [x] Remove stale line-count, test-count, and completion-state claims across roadmap/status/docs.
- [x] Add concrete, tracked report-power artifacts (history/progress/gates/detail) and document deterministic regeneration.
- [x] Add teach delivery-stage labs and FDE role workflow docs with artifact-driven acceptance criteria.

Acceptance criteria:

- A generated-schema source path is defined and documented.
- CI fails when generated schema drifts from source model.
- No stale count claims remain in maintained docs surfaces.

### 4D.2 Prioritized execution backlog from review findings (P0)

- [x] Schema enum sync from TS + CI drift guard (`pnpm schema:check`). Audit 2026-09-14: `scripts/sync-eval-report-v1-schema.ts` patches enums/consts into a hand-maintained schema; it does not generate the schema from TS types, so a newly added optional field does not trip the guard.
- [x] Runtime validation hardening with a stable error shape (`ValidationIssue { code, path, message }`). Audit 2026-09-14: validation is hand-rolled in `src/model/validate.ts`, not Ajv — Ajv is not a dependency — and `path` is reverse-parsed from message strings, which is fragile.
- [x] CI-native machine outputs (JUnit, SARIF, GitHub annotations).
- [ ] First-class usage metrics path (tokens/cost/latency). Audit 2026-09-14: latency (`durationMs`) and cost (`metadata` alias keys) are read opportunistically by the reporters only. Token metrics are absent entirely and none of the three are schema fields, so the additive-fields acceptance criterion is unmet.
- [x] Python emitter/adoption path.
- [ ] Interop adapter expansion (Ragas, Langfuse, Phoenix, Braintrust, OpenAI eval outputs). Audit 2026-09-15: Ragas and Langfuse now have real coded adapters, fixtures, and passing tests (`src/cli/import-adapters.ts`, `test/import-adapters-ragas-langfuse.test.ts`). Phoenix, Braintrust, and OpenAI eval outputs remain docs-only conversion notes with no coded adapter, fixture, or test. Tracked as 4E.9.
- [x] Judge calibration workflow and measurable agreement reporting.
- [x] Trace-link evidence hardening guidance (`rows[].trace` deep links). Audit 2026-09-14: OpenTelemetry-specific guidance is still missing — no semantic-convention or span-attribute mapping in `docs/integrations/trace-stacks.md`.

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
   - Acceptance: SARIF artifact includes stable report location plus row-anchor metadata
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
