---
name: eval-dashboards-adopt
description: Wire @icodenet/eval-dashboards into an existing repo's eval runner.
version: 0.1.0
author: Byron Thanopoulos (IcodeNet), eval-dashboards maintainers
license: MIT
platforms: [linux, macos, windows]
metadata:
  tags: [evals, eval-report-v1, ci, quality-gates, onboarding]
  package: "@icodenet/eval-dashboards"
---

# Adopt eval-dashboards Into An Existing Repo

Retrofit a repo's existing eval runner (Vitest, Jest, pytest, or a plain
script) to emit `eval-report/v1` JSON and wire `eval-dashboards` reports/gates
into its CI — without replacing the runner or its dataset/scoring logic.

This skill is shipped **from** the `eval-dashboards` package repo but is meant
to be run **against a different repo**: the one that already has an eval
program and wants dashboards, gates, and history for free.

## When to Use

- A user asks to "add eval-dashboards to this repo", "get an HTML report for
  our evals", or "gate CI on eval pass rate" and the repo already runs some
  form of eval/test suite that scores pass/fail per case.
- The target repo has zero `eval-report/v1` artifacts today (greenfield
  adoption). For a repo that already emits `eval-report/v1`, skip straight to
  wiring CI (Step 4).

Don't use for: building a new eval runner from scratch (this skill only
standardizes the *output* of a runner that already exists), or repos with no
concept of pass/fail eval cases at all.

## Prerequisites

- Target repo has an existing eval/test command that runs and knows, per
  case, at minimum `passed: boolean` and something identifying the case
  (`suite` name, an id, or both).
- Node.js >=20 available in the target repo (or its CI image) to run the
  `eval-dashboards` CLI. The target repo's own eval runner can be any
  language — only the reporting step needs Node.
- `pnpm add -D @icodenet/eval-dashboards` (or npm/yarn equivalent) must
  succeed in the target repo.

## How to Run

Drive every step through the coding-agent tools already available to you in
the target repo (`read_file`, `search_files`, `patch`/`write_file`,
`terminal` for install/test commands) — this skill is a procedure, not a
script to execute blindly.

## Procedure

1. **Inspect the existing eval runner.**
   Find how the target repo currently runs evals and what it scores.
   `search_files` for the eval/test command in `package.json` scripts,
   `pyproject.toml`, or CI config. Read one existing test/eval file to see
   what data is available per case: input, output, expected, pass/fail,
   score, category, severity. Completion criterion: you can name the exact
   command that runs evals today and list which of those fields exist.

2. **Install the package and read its contract.**
   `terminal("pnpm add -D @icodenet/eval-dashboards")` in the target repo.
   Read `node_modules/@icodenet/eval-dashboards/docs/artifact-format.md` (or
   the published docs) for the `EvalReportV1` / `EvalRow` shape — do not
   invent field names. Completion criterion: install succeeds and you can
   state the required row fields (`id`, `suite`, `passed`) plus which
   optional fields apply to this repo's case kind (`deterministic`, `agent`,
   `llm-judge`, `human-review`).

3. **Write a thin adapter, not a hand-rolled JSON writer.**
   Use the public helpers instead of constructing the artifact by hand:
   ```ts
   import { writeEvalReportArtifact } from '@icodenet/eval-dashboards';

   await writeEvalReportArtifact('.evals_output/run.json', {
     run: { id: process.env.BUILD_ID ?? 'local-run', project: '<target-repo-name>' },
     cases: existingResults.map((r) => ({
       id: r.id,
       suite: r.suiteName,
       passed: r.passed,
       severity: r.severity, // omit if the repo has no severity concept yet
       category: r.failureReason,
       input: r.input,
       output: r.output,
     })),
   });
   ```
   Map only fields the target repo actually has evidence for — do not
   fabricate `judgeModel`, `toolCalls`, etc. Completion criterion: running
   the target repo's existing eval command now also produces one
   `.evals_output/*.json` file that passes `eval-dashboards lint`.

4. **Wire report/check into the target repo's CI.**
   Use `examples/github-actions/eval-quality.yml` or
   `examples/azure-devops/azure-pipelines-eval.yml` from the eval-dashboards
   package as the template — adapt paths, not the gate logic. Add, after the
   eval command runs:
   ```sh
   eval-dashboards check --input=.evals_output --baseline-strategy=rolling --allow-blocked-baseline --max-new-failures=0
   eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
   ```
   Completion criterion: the CI file diff is additive (existing eval command
   untouched) and a local dry run of both commands exits 0 against the
   artifact from Step 3.

5. **Open a PR, not a tutorial.**
   Commit the adapter, the `.evals_output` gitignore entry (history files
   should NOT ship in the main branch unless the repo wants committed
   history), and the CI diff. PR description states: what the existing
   runner still does unchanged, what new artifact it now emits, and the exact
   commands used to verify (Step 3 and Step 4 completion criteria). Completion
   criterion: PR is open and CI runs the new `check`/`report` steps
   successfully at least once.

## Pitfalls

- **Do not replace the target repo's dataset, scoring, or judge logic.** This
  skill only adds a reporting/gating layer on top of existing pass/fail
  evidence — see `AGENTS.md` in the eval-dashboards repo: "runner-agnostic
  core... prefer improving the contract over one-off dashboard hacks."
- **Do not hand-write the `eval-report/v1` JSON shape.** Use
  `writeEvalReportArtifact`/`createEvalReportArtifact` — they compute suite
  totals from rows and apply provenance/lifecycle defaults, so drift between
  suite summaries and row evidence cannot happen.
- **Directory inputs, not glob strings, in config** (`input: ['.evals_output']`)
  — a literal glob string used as the config value is a known integration
  footgun documented in this repo's `docs/ROADMAP.md`.
- **Blocking suites need an explicit `rubricVersion`** if any row uses
  `llm-judge` grading — omit it and gate enforcement is not portable and may
  under-report drift.
- **Clean `.evals_output` before writing a new artifact** if the target
  repo's workflow is single-file-snapshot, not history-preserving — otherwise
  stale runs remain and confuse "new failures" comparisons.

## Verification

- `eval-dashboards lint --input=.evals_output` exits 0 on the artifact
  produced in Step 3.
- `eval-dashboards check --input=.evals_output ...` (Step 4 command) exits
  with a status the target repo's maintainers agree matches current quality
  (0 if evals currently pass, non-zero and understood if not).
- `eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report`
  produces a report that opens and shows real rows, not an empty state.
- The target repo's existing eval/test command still passes/produces its
  original output unchanged — this skill is additive only.
