# Teach Curriculum: Evals for Beginners Using eval-dashboards

This page is the map.
The step-by-step practical work is in separate exercise files under docs/teach-exercises/.

How to use this curriculum (concept-first)
- Read each stage in this order: Concept -> Why this matters -> Practice.
- Do not jump to commands first.
- After each stage, explain the concept in your own words before moving on.

Use this with:
- [artifact-format.md](artifact-format.md)
- [taxonomy.md](taxonomy.md)
- [onboarding-runbook.md](onboarding-runbook.md)
- `eval-dashboards init --preset=agent-quality --teach`

Recommended conceptual pre-read (before section 0):
- [Langfuse 101: Evals Feedback Loop](https://icodenet.github.io/langfuse-101/)
  - Read this first if you are new to eval operating models.
  - Then continue with this curriculum for `eval-report/v1` implementation details.

Exercise rules
- Every exercise uses simple English.
- Every exercise has copy-paste commands.
- Every exercise has expected results and a definition of done.
- Commands assume you are at your project root.
- Work inside a scratch directory, never the repo root of a real project you
  care about. `init --write` and the JSON-editing steps below create/modify
  files in the current directory; a stray run in a real checkout leaves
  behind fixture files and stray `eval/` folders that don't belong in your
  commit history. Create one, e.g. `mkdir -p /tmp/eval-dashboards-exercises
  && cd /tmp/eval-dashboards-exercises`, and run every exercise from there.
- Setup once before exercises: `pnpm add -D @icodenet/eval-dashboards`
- Run commands as `npx eval-dashboards ...`
- Some exercises use `python3` for quick JSON edits.
- Exercises 02, 04, 05, 06, 07, 08, 09, 10 share one mutating artifact in
  `.evals_output/` — each one edits or gates the output of the previous
  exercise, in that exact order. Skipping or reordering one breaks a later
  one (for example, Ex05's suite manifest changes what Ex07's lint run
  requires). Exercises 01, 03, 11 and the PM track can be done independently
  (11 needs its own fixture, documented in that file).

Exercise workbook files
- [01 Foundations](teach-exercises/01-foundations.md)
- [02 Minimal artifact](teach-exercises/02-artifact-first.md)
- [03 First synthetic dataset](teach-exercises/03-first-synthetic-dataset.md)
- [04 Row taxonomy (detailed)](teach-exercises/04-row-taxonomy.md)
- [05 Suite taxonomy](teach-exercises/05-suite-taxonomy.md)
- [06 Live agent evidence](teach-exercises/06-live-agent-evidence.md)
- [07 Judge calibration](teach-exercises/07-judge-calibration.md)
- [08 Gates and release](teach-exercises/08-gates-release.md)
- [09 Reports and history](teach-exercises/09-reports-history.md)
- [10 Iteration loop](teach-exercises/10-iteration-loop.md)
- [11 Diagnose a red run](teach-exercises/11-diagnose-a-red-run.md)

Non-engineer reading tracks (no CLI/JSON authoring required)
- [PM-01: is this release safe?](teach-exercises/pm-01-reading-a-report.md)
- [PM-02: comparing two reports over time](teach-exercises/pm-02-reading-drift.md)

Delivery-stage labs (artifact-first operations)
- [Teach labs index](teach-labs/README.md)
- [Lab 01: Local dev loop](teach-labs/01-local-dev-loop.md)
- [Lab 02: Pre-PR gating](teach-labs/02-pre-pr-gating.md)
- [Lab 03: PR review triage](teach-labs/03-pr-review-triage.md)
- [Lab 04: Release readiness](teach-labs/04-release-readiness.md)
- [Lab 05: Post-release monitoring](teach-labs/05-post-release-monitoring.md)
- [FDE role workflow lab](teach-labs/fde-role-workflow.md)

---

## 0) Learning outcomes

By the end, a beginner should be able to:
- Explain what evals are and what they are not.
- Emit a valid eval-report/v1 artifact from any runner.
- Add useful row evidence and suite governance metadata.
- Run lint, check, and report in the right order.
- Compare runs without confusing dataset/rubric changes for product regressions.
- Decide when to extend taxonomy or schema.

---

## 1) Foundations: what evals are

Concept
- Evals are repeatable tests for behavior quality.
- One good-looking output is not enough evidence.
- Private, task-specific eval suites matter more than public leaderboard scores for release decisions.

Why this matters
- Teams often confuse model demos with production quality.
- This stage sets the mindset that release decisions need repeatable evidence.

Practice
- Do [Exercise 01 Foundations](teach-exercises/01-foundations.md).

---

## 2) Artifact-first model in this repo

Concept
- The handoff contract is `schemaVersion: "eval-report/v1"`.
- Any runner can emit this shape (Node, Python, custom harness).
- Reports and gates consume artifacts, not a specific vendor runtime.

Why this matters
- If the team depends on one runtime/vendor shape, adoption and migration become brittle.
- Artifact-first design keeps eval workflows portable.

Practice
- Do [Exercise 02 Minimal artifact](teach-exercises/02-artifact-first.md).

---

## 3) First synthetic dataset (small, high-signal)

Concept
- Start with 10 to 30 rows.
- Include happy path, edge cases, safety/adversarial cases, and tool-use cases.
- Keep row IDs stable from day one.

Why this matters
- Large weak datasets waste time and hide failure patterns.
- Small high-signal sets teach fast iteration and cleaner triage.

Practice
- Do [Exercise 03 First synthetic dataset](teach-exercises/03-first-synthetic-dataset.md).

---

## 4) Taxonomy essentials (row level)

Concept
- Minimal valid means "the file loads".
- Taxonomy-complete means "a teammate can debug this row quickly".
- A strong row should answer five fast questions:
  1) what type of check failed,
  2) how serious it is,
  3) which dataset/scenario/rubric it belongs to,
  4) what input/output/expected evidence says,
  5) why it passed or failed.

Why this matters
- Missing row metadata slows triage and causes weak postmortems.
- Complete row evidence turns failures into actionable fixes.

Recommended row fields
- classification: `kind`, `severity`, `category`
- governance IDs: `datasetId`, `scenarioId`, `rubricId`, `promptVersion`, `agentVersion`, `agentChannel`
- evidence by kind:
  - deterministic: `input`, `output`, `expected`, `reason`
  - agent: `turns`, `toolCalls`
  - llm-judge: `judgeModel`, `judgeVerdict`, `judgeReasoning`, `axisScores`
  - human-review: `groundTruthVerdict`, `groundTruthCategory`, `groundTruthAnnotation`

Practice
- Do [Exercise 04 Row taxonomy](teach-exercises/04-row-taxonomy.md).

---

## 5) Taxonomy essentials (suite level)

Concept
- Use `suiteManifests[]` and `rubricContracts[]`.
- Make gate intent explicit (`blocking` vs `report-only`).
- Keep dataset and rubric versions explicit.

Why this matters
- Suite-level governance prevents accidental gate drift.
- Explicit versions protect comparison integrity across runs.

Practice
- Do [Exercise 05 Suite taxonomy](teach-exercises/05-suite-taxonomy.md).

---

## 6) Live agent evals and evidence capture

Concept
- Evaluate trajectory, not only final text.
- Capture turns, tool calls, tool args/results/errors, and latency.

Why this matters
- Final answers can look correct while the internal path is unsafe or expensive.
- Trajectory evidence is required for real agent debugging.

Practice
- Do [Exercise 06 Live agent evidence](teach-exercises/06-live-agent-evidence.md).

---

## 7) Judges, calibration, and reviewer loops

Concept
- Use the cheapest reliable evaluator for each failure mode.
- Keep judge rows explicit and calibrate against reviewed labels.

Why this matters
- Uncalibrated judges produce noisy scores and false confidence.
- Calibration keeps automated grading aligned with human standards.

Practice
- Do [Exercise 07 Judge calibration](teach-exercises/07-judge-calibration.md).

---

## 8) Gates and release decisions

Concept
- Typical starter gates: pass rate, zero critical, max new failures.
- Run in this order: lint -> check -> report.

Why this matters
- Teams need deterministic release criteria, not ad-hoc approvals.
- Ordered execution reduces hidden failures and inconsistent outcomes.

Practice
- Do [Exercise 08 Gates and release](teach-exercises/08-gates-release.md).

---

## 9) Reports and history

Concept
- Keep one artifact file per run.
- Stable IDs are required for useful history.
- Compare runs to find new failures and persistent failures.

Why this matters
- Without historical continuity, teams cannot separate regressions from known debt.
- History transforms one-off results into trend-based decisions.

Practice
- Do [Exercise 09 Reports and history](teach-exercises/09-reports-history.md).

---

## 10) Iteration loop (operating cadence)

Concept
- Find top failing cluster.
- Classify root cause.
- Change one thing.
- Re-run targeted suites.
- Re-run full gate path.
- Compare with baseline/history.

Why this matters
- Unstructured iteration creates churn and unclear progress.
- A fixed cadence makes improvement measurable and repeatable.

Practice
- Do [Exercise 10 Iteration loop](teach-exercises/10-iteration-loop.md).

---

## 11) Schema versioning and extension policy

Rules for eval-report/v1
- Prefer additive optional fields.
- Do not remove/rename/narrow existing fields in place.
- Create a new schemaVersion only for unavoidable breaking changes.
- Consumers should ignore unknown fields.

Safe extension checklist
1) Needed across runners (not one-off)?
2) Additive and optional?
3) Documented in artifact/taxonomy docs?
4) Example artifact updated?
5) Lint/report behavior updated?

---

## 12) Anti-patterns to avoid

- Treating one green run as proof.
- Hiding judge/tool failures as passes.
- Mixing agent dataset and judge calibration dataset without separation.
- Silent ID/rubric changes that break comparability.

---

## 13) Suggested beginner milestones (first 2 weeks)

Week 1
- Emit first valid artifact.
- Add 10 to 30 synthetic rows.
- Run lint/check/report locally.
- Add at least one suite manifest and one rubric contract.

Week 2
- Add one live tool-use suite.
- Add one judge suite and one calibration slice.
- Add baseline comparison and a simple CI gate.
- Use category/severity evidence to choose next fix.

---

## 14) 2026 context: why this curriculum is strict

Three practical trends:
1) hosted platform lifecycle risk exists,
2) agentic eval variance is real,
3) contamination resistance and benchmark stewardship matter.

Implication
- Keep evals artifact-first, runner-agnostic, and reproducible.

---

## 15) Method lessons incorporated

This curriculum intentionally teaches:
- eval stack thinking (tests + offline evals + human review + production signal),
- small gold set first, then scale,
- judge alignment before judge automation,
- parallel evidence then reconciliation,
- short iterate loops.

---

## 16) Concepts adapted from langfuse-101 that fit EVD core

Kept concepts
- evaluator choice decision tree,
- separate agent and calibration datasets,
- decomposed scoring for triage,
- capture -> score -> review -> dataset -> experiment -> release loop.

Not kept
- platform-coupled implementation assumptions.

---

## 17) Reusable command path for novices

```sh
# 0) install once in this repo
pnpm add -D @icodenet/eval-dashboards

# 1) scaffold starter files
npx eval-dashboards init --preset=agent-quality --write

# 2) optional guided walkthrough
npx eval-dashboards init --preset=agent-quality --teach

# 3) emit your real eval artifact into .evals_output/

# 4) fast semantic/taxonomy checks
npx eval-dashboards lint --input=.evals_output

# 5) release gates
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --zero-critical

# 6) reporting
npx eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --reporter=markdown-summary --reporter=text --report-dir=eval-dashboard
```

If a learner can run this path and explain why each step exists, they are ready to iterate safely.
