# Lab 04: Release readiness

## What this lab teaches

How to assemble a complete, verifiable **evidence packet** that proves an agent
is safe to release — and to hand it to someone who was not in the room.

By the end you will be able to turn *"we think the agent is ready"* into
*"here is the data showing exactly why it is ready, and exactly what is still
broken."*

Four ideas, in order:

1. **Release readiness is a packet, not a checkmark.** A single green gate can
   hide unresolved failures and a weakening trend. Real readiness bundles the
   gate result, the run history, and the row-level rationale together.
2. **Build the bundle fresh.** Stale artifacts are the most common way teams
   ship a report that describes a build nobody released.
3. **Summarise confidence from machine outputs, not screenshots.** The numbers a
   stakeholder needs must be extractable by script, so they can be audited
   independently.
4. **Extract the blockers.** Anything still failing goes into the release notes
   in the team's own words, before a user finds it.

## Why this matters

The gate in this lab **passes**. The build is still carrying two known
failures.

That is not a bug in the tool — it is the entire point. `--min-pass-rate=0.95`
means "95% is good enough to ship", so a 97.33% run passes with failures
remaining. If your release process stops at the green check, nobody ever writes
those two failures down, and they reach production undocumented.

A packet forces the question: *we are shipping — what are we knowingly shipping
with?*

## Lab question

Can you build a release packet that another stakeholder can validate
independently, without asking you what any number means?

## Prerequisites

- Lab 02 (pre-PR gating) — you know what a gate is.
- Lab 03 (PR review triage) — you can read a failing row.

## Steps

### 1) Regenerate deterministic artifacts

```sh
./scripts/generate-report-power-artifacts.sh
```

Why: the bundle must describe the build you are actually shipping. Regenerating
first removes any chance of reporting a stale run.

### 2) Build a fresh release bundle

```sh
rm -rf .tmp/release-readiness
pnpm cli:dev report --input=examples/report-power-artifacts/.evals_output --reporter=html --reporter=json-summary --reporter=markdown-summary --report-dir=.tmp/release-readiness
pnpm cli:dev history --input=examples/report-power-artifacts/.evals_output --out=.tmp/release-readiness/history.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/release-readiness/check.json
```

The `rm -rf` is deliberate: an unclean directory is how a previous release's
`index.html` ends up attached to this release's sign-off email.

Three reporters, three audiences: `html` for a human signing off,
`json-summary` for scripts and auditors, `markdown-summary` for the PR or
release note.

Expected output from `check`:

```text
Gate diagnostics:
Top failing categories: conciseness=1, groundedness=1
Lint warning breakdown: missing-judge-model=55, missing-judge-reasoning=55, missing-agent-versioning=20, low-category-coverage=2
Eval gates passed.
```

Read that carefully. **"Eval gates passed"** and **two failing categories** on
the same screen. Note also 55 rows with no judge model recorded — the gate is
green, but the evidence behind it is thin. That is a process finding worth
raising even on a passing release.

### 3) Summarise the confidence signals

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('.tmp/release-readiness/summary.json').read_text())
history = json.loads(Path('.tmp/release-readiness/history.json').read_text())
check = json.loads(Path('.tmp/release-readiness/check.json').read_text())
print('release_gate_passed=', check['passed'])
print('run=', summary['summary']['run']['id'])
print('pass_rate=', round(summary['summary']['passRate'] * 100, 2))
print('baseline=', summary['comparison'].get('previousRunId'))
print('history_runs=', len(history))
print('persistent_failures=', len(summary['comparison'].get('persistentFailures', [])))
PY
```

Expected output:

```text
release_gate_passed= True
run= agent-v4-2026-07-31
pass_rate= 97.33
baseline= agent-v3-2026-07-30
history_runs= 2
persistent_failures= 2
```

How to read each line:

| Signal | What it answers | Watch out for |
|---|---|---|
| `release_gate_passed` | Did policy allow this build? | True does not mean zero failures. |
| `run` / `baseline` | What was compared to what? | If the baseline is not the build you shipped last, the comparison is meaningless. |
| `pass_rate` | How much passed? | A high rate hides *which* rows failed. Never quote it alone. |
| `history_runs` | How much trend evidence exists? | `2` is thin. Two runs cannot show a trend. Be honest about that. |
| `persistent_failures` | What is still broken from before? | Non-zero on a passing gate is the signal this lab exists for. |

### 4) Extract row-level blockers for the release notes

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('.tmp/release-readiness/summary.json').read_text())
for row in summary['comparison'].get('persistentFailures', []):
  print(f"{row['id']} | severity={row['severity']} | reason={row.get('reason')}")
PY
```

Expected output:

```text
rq-fail-1 | severity=medium | reason=Response exceeded 200 words
rq-fail-3 | severity=low | reason=Minor citation gap - partially addressed in this build
```

These two lines are the deliverable. They go into the release notes as known
limitations, in plain language, with an owner. `medium` verbosity is a quality
annoyance; a `critical` here would stop the release regardless of the gate.

## Expected outputs

- `.tmp/release-readiness/check.json` — machine-readable gate status.
- `.tmp/release-readiness/history.json` — retained run history.
- `.tmp/release-readiness/summary.json` — progress and row-level detail.
- `.tmp/release-readiness/index.html` — human sign-off view.

## Common mistakes

- **Treating the green gate as the whole answer.** This run passes with two open
  failures. If your summary does not mention them, your packet is misleading.
- **Quoting the pass rate alone.** 97.33% sounds excellent and says nothing
  about severity.
- **Claiming a trend from two runs.** `history_runs=2` supports no trend claim.
- **Reusing a directory.** Without the `rm -rf`, you may ship last release's HTML.
- **Ignoring lint warnings on a pass.** 55 rows missing judge evidence means the
  next failure will be hard to diagnose.

## Definition of done

You can hand a stakeholder the four files, and they can independently confirm:
the gate result and the policy that produced it, what it was compared against,
how much history backs it, and every failure the team is knowingly shipping
with — without asking you a single clarifying question.
