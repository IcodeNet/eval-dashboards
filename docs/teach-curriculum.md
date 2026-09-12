# Teach Curriculum: Evals for Beginners Using `eval-dashboards`

This curriculum is a practical learning path for people who are new to evals and new to `@icodenet/eval-dashboards`.

It is designed around the core contract of this repo:

1. A runner emits `eval-report/v1` JSON artifacts.
2. `eval-dashboards` validates, gates, compares history, and renders reports.
3. Teams iterate from evidence, not anecdotes.

Use this with:
- [artifact-format.md](artifact-format.md)
- [taxonomy.md](taxonomy.md)
- [onboarding-runbook.md](onboarding-runbook.md)
- `eval-dashboards init --preset=agent-quality --teach`

---

## 0) Learning outcomes

By the end, a beginner should be able to:

- Explain what evals are and what they are not.
- Explain the four-layer eval stack: deterministic tests, offline dataset evals, human review, and production metrics.
- Create a first synthetic dataset with stable IDs and clear scope.
- Emit a valid `eval-report/v1` artifact from any runner.
- Add judge evidence and suite governance metadata.
- Run `lint`, `check`, `report`, and inspect failures with evidence.
- Compare runs over time without confusing dataset changes for product regressions.
- Decide when to extend taxonomy or schema, and when not to.

---

## 1) Foundations: what evals are

### Concepts

- Evals are repeatable tests for model/agent behavior quality.
- Evals are not demos and not one-off “good answers”.
- A score without evidence is weak; a score with row-level evidence is actionable.

### Minimum novice understanding

- Why nondeterministic systems still need repeatable checks.
- Why “it looked good in one run” is not enough for release confidence.
- Why private, task-specific eval suites usually matter more than public leaderboard numbers for production decisions.

### Exercise

- Explain one real product behavior you care about (for example: grounded support answers).
- Write one sentence for what failure means in production.

---

## 2) Artifact-first model in this repo

### Concepts

- The shared handoff is `schemaVersion: "eval-report/v1"`.
- Any runner can emit this shape (Vitest, Jest, Node, Python, custom harness).
- Reports and gates consume artifacts; they do not depend on one specific runtime vendor.

### Minimum fields

- Top-level: `schemaVersion`, `run`, `suites`, `rows`.
- Row minimum: `id`, `suite`, `passed`.

### Why this matters

- Keeps the core runner-agnostic.
- Supports offline static reporting.
- Makes CI and history consistent across stacks.

### Exercise

- Validate a tiny artifact against [artifact-format.md](artifact-format.md) and `schemas/eval-report-v1.schema.json`.

---

## 3) First synthetic dataset (small, high-signal)

### Concepts

Start with 10–30 rows. Split cases across:

- happy path
- edge cases
- adversarial/safety
- tool-routing/tool-argument checks
- at least one multi-turn scenario if the product is multi-turn

### Dataset quality rules

- Stable row IDs from day one.
- One behavior per row.
- Avoid near-duplicate paraphrase spam.
- Keep `metadata.provenance` and `metadata.lifecycle` explicit when possible.

### Exercise

- Create `eval/datasets/agent-quality-cases.jsonl` from `init --preset=agent-quality --write`.
- Add 4 new rows: 2 expected-pass, 2 expected-fail.

---

## 4) Taxonomy essentials (row level)

### Concepts

A novice should move from “minimal valid” to “taxonomy-complete” rows.

Recommended row fields:

- classification: `kind`, `severity`, `category`
- governance IDs: `datasetId`, `scenarioId`, `rubricId`, `promptVersion`, `agentVersion`, `agentChannel`
- evidence by kind:
  - deterministic: `input`, `output`, `expected`, `reason`
  - agent: `turns`, `toolCalls`
  - llm-judge: `judgeModel`, `judgeVerdict`, `judgeReasoning`, `axisScores`
  - human-review: `groundTruthVerdict`, `groundTruthCategory`, `groundTruthAnnotation`

### Why this matters

- Better filters, triage, and trend analysis.
- Better baseline compatibility interpretation.
- Better ownership and auditability.

### Exercise

- Upgrade one minimal row to taxonomy-complete.
- Confirm `eval-dashboards lint` emits fewer taxonomy warnings.

---

## 5) Taxonomy essentials (suite level)

### Concepts

Use `suiteManifests[]` and `rubricContracts[]` so suites are governable.

Suite manifest essentials:

- `name`, `target`, `riskArea`, `datasetSource`, `datasetVersion`
- `graders`
- `gate: { mode, thresholds }`

Rubric contract essentials:

- `suiteName`, `rubricVersion`
- per-axis rubric declarations

### Why this matters

- Makes gates explainable.
- Prevents hidden rubric drift.
- Keeps baseline comparisons honest.

### Exercise

- Add a `suiteManifests` entry for one safety suite and one quality suite.

---

## 6) Live agent evals and evidence capture

### Concepts

If your product uses tools or multi-turn flows, evaluate the real trajectory:

- user input
- assistant output
- tool name/args/result/error
- turn sequence
- duration/latency

### Why this matters

- Single-turn text-only checks miss routing and tool failures.
- Many regressions happen in intermediate steps, not only final prose.

### Exercise

- Emit one row with `turns[]` and `toolCalls[]` from a real run.

---

## 7) Judges, calibration, and reviewer loops

### Concepts

Use the cheapest reliable evaluator per failure mode:

- deterministic assertions for exact contracts
- LLM judge for nuanced quality/safety dimensions
- human review for high-stakes ambiguity and calibration

Judge-quality basics:

- keep rubric explicit
- capture `judgeReasoning`
- calibrate against reviewed labels before using blocking gates

### Exercise

- Add a judge suite row with `judgeModel`, `judgeVerdict`, `judgeReasoning`, and `axisScores`.
- Add one calibration row with ground-truth fields.

---

## 8) Gates and release decisions

### Concepts

Common starter gates:

- minimum pass rate
- zero critical failures
- max new failures vs baseline

Use `blocking` only when:

- dataset/rubric are stable enough
- identities are stable
- calibration is acceptable for judge-driven suites

### Exercise

Run in order:

1. `eval-dashboards lint --input=.evals_output`
2. `eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical`
3. `eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-dashboard`

---

## 9) Reports and history

### Concepts

Read reports as a debugging tool, not only as a KPI board:

- Which suites regressed?
- Are failures new or persistent?
- Which categories/severities dominate?
- Did dataset/rubric/version changes affect comparability?

History basics:

- keep one file per run
- keep stable row IDs
- annotate dataset and rubric changes

### Exercise

- Run at least two artifacts and compare latest vs previous.

---

## 10) Iteration loop (operating cadence)

### Concepts

Use a strict loop:

1. identify top failure cluster
2. classify root cause (agent, dataset, rubric, judge, harness)
3. change one thing
4. re-run targeted suites
5. re-run full gate path
6. compare against baseline and history

### Exercise

- Fix one failing row by changing either rubric text or agent behavior.
- Record why the change was made.

---

## 11) Schema versioning and extension policy

This repo is conservative by design.

### `eval-report/v1` rules

- Prefer additive optional fields.
- Do not remove/rename/narrow existing fields in place.
- Introduce a new `schemaVersion` only when a breaking change is unavoidable.
- Consumers should ignore unknown fields.

### When to extend taxonomy

Extend taxonomy when a recurring behavior cannot be clearly represented with existing fields and labels, and teams need that dimension for decisions, reporting, or gating.

### When to extend schema

Extend schema when multiple runners need the same new field for portability, history, gates, or audits.

### Do not extend for

- one-off local debugging details
- vendor-specific payloads better stored in `metadata`
- decorative UI ideas without artifact-level decision value

### Safe extension checklist

Before adding a field:

1. Is this needed across runners, not only one harness?
2. Can this be optional and additive?
3. Is it documented in artifact + taxonomy docs?
4. Is there at least one updated example artifact?
5. Is there lint/report behavior that teaches usage?

---

## 12) Anti-patterns to teach explicitly

- Treating one green run as proof.
- Hiding judge/tool infra failures as passes.
- Mixing agent-eval datasets and judge-calibration datasets without distinction.
- Overfitting to a fixed benchmark and neglecting private production-representative cases.
- Breaking comparability by changing IDs or rubrics silently.

---

## 13) Suggested beginner milestones (first 2 weeks)

Week 1

- Emit first valid artifact.
- Add 10–30 synthetic rows.
- Run lint/check/report locally.
- Add one suite manifest and one rubric contract.

Week 2

- Add one live tool-use suite.
- Add one judge suite and one calibration slice.
- Add baseline comparison and a simple CI gate.
- Review failures with category/severity and choose next iteration focus.

---

## 14) 2026 context: what changed and why this curriculum is strict

As of Sep 2026, three trends matter for teams building durable eval programs:

1. Hosted-eval platform risk
   - OpenAI docs publish a deprecation timeline for its hosted Evals platform (read-only then shutdown in 2026).
   - Implication: teach code-first, artifact-first, runner-agnostic workflows.

2. Agentic eval noise is measurable
   - “On Randomness in Agentic Evals” (arXiv:2602.07150) reports non-trivial variance in single-run pass@1, including at low-temperature settings.
   - Implication: avoid over-trusting tiny deltas from one run.

3. Contamination resistance is becoming central
   - DeepMind/MLCommons (Aug 2026) describe double-blind evaluation pilots with confidential computing and protected prompts/weights.
   - Implication: teach private benchmark stewardship and holdout discipline.

This curriculum keeps those lessons aligned with `eval-dashboards` core values: artifact-first, runner-agnostic, offline-friendly, and versioned governance metadata.

---

## 15) Incorporated lessons from the two YouTube trainings

Sources used:

- https://youtu.be/TL527yTpxlk?si=Oq6DcRup9UsaeQyu
- https://youtu.be/a3SMraZWNNs?si=XsyQSfYyCeEsL82s

The curriculum above now explicitly incorporates the following teaching points that fit EVD's core:

1. Teach evals as a stack, not one tool
   - Layer 1: deterministic tests (exact contracts)
   - Layer 2: offline dataset evals (repeatable release checks)
   - Layer 3: human review (ambiguous or high-stakes cases)
   - Layer 4: production metrics/feedback (real-world outcome signal)

2. Start with a small gold set, then scale
   - Start around 10 high-signal rows to validate shape and rubric.
   - Scale toward larger sets (for example 100+) only after labeling quality and runner reliability are stable.

3. Judge alignment before judge automation
   - A judge is useful only when it aligns with reviewed labels on calibration slices.
   - Keep disagreement analysis as a first-class step before moving suites to blocking mode.

4. Parallel evidence, then reconcile
   - Run automated judge scoring and human review in parallel on selected slices.
   - Use disagreement categories to improve rubric wording, not only model prompts.

5. Error analysis is part of the product loop
   - Every report should support failure diagnosis (category/severity/evidence), not only pass-rate display.
   - Improvements are accepted only when a rerun shows better evidence under the same IDs/rubrics.

6. Iteration speed is a core capability
   - The value of evals is how quickly they let a team detect, explain, and fix regressions.
   - This is why the command path is intentionally short: `lint` -> `check` -> `report`.

These points are compatible with EVD because they are methodology-level and map directly to `eval-report/v1` row evidence, taxonomy fields, and gate/history flows.

---

## 16) Concepts adapted from `langfuse-101` that fit EVD core

The following concepts transfer cleanly into `eval-dashboards` without coupling EVD to a single observability platform:

- Decision tree for evaluator choice
  - Keep the "cheapest reliable check" model: tests for exact contracts, deterministic evaluators for repeatable bars, LLM judges for semantic dimensions, humans for high-stakes ambiguity.
- Separate agent-eval datasets from judge-calibration datasets
  - Agent dataset asks "is agent behavior good enough?"
  - Judge dataset asks "does evaluator agree with reviewed labels?"
- Decomposed scoring for operations
  - Use verdict/category/severity style outputs so failures can be routed and triaged.
- Feedback loop operating model
  - capture -> score -> review -> dataset -> experiment -> release decision.

These are compatible with EVD because they remain artifact-level concepts and map to portable fields in `eval-report/v1` (`rows`, `suiteManifests`, `rubricContracts`, governance metadata).

---

## 17) Reusable command path for novices

```sh
# 1) scaffold starter files
eval-dashboards init --preset=agent-quality --write

# 2) optional guided walkthrough
eval-dashboards init --preset=agent-quality --teach

# 3) emit your real eval artifact into .evals_output/

# 4) fast semantic/taxonomy checks
eval-dashboards lint --input=.evals_output

# 5) release gates
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical

# 6) reporting
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --reporter=markdown-summary --reporter=text --report-dir=eval-dashboard
```

If the learner can run this path and explain why each step exists, they are ready to iterate safely.
