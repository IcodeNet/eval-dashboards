# Lab 03: PR review triage

Concept

PR triage is comparison analysis: what got worse, what stayed broken, and what improved.

## What this lab teaches

1. **Triage is a comparison, not a snapshot.** You need the previous run's
   result alongside the current one to say anything about regression or
   improvement.
2. **`disappeared` and `newlyPassing` mean different things.** Conflating them
   turns "4 rows vanished from the dataset" into a false "4 issues fixed"
   claim in a PR comment.
3. **A reviewer-ready note cites row IDs, not just counts.** "2 failures" is
   not actionable; `rq-fail-1`, `rq-fail-3` with reasons is.

Why this matters

Without structured comparison, reviewers focus on loud failures and miss persistence, regressions, or ID churn that affects confidence.

Lab question

Can you produce a reviewer-ready triage note from run-to-run evidence?

Lab outline

1. Refresh artifacts. (evidence class: all four)
2. Read history and run comparison context. (evidence class: history, progress)
3. Extract persistent, disappeared, and newly passing rows. (evidence class: row detail)
4. Confirm the gate status used by reviewers. (evidence class: gate decision)

## Steps

1) Ensure artifacts are current.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Pull progression + history snapshot.

```sh
python3 - <<'PY'
import json
from pathlib import Path
history = json.loads(Path('examples/report-power-artifacts/report/history.json').read_text())
summary = json.loads(Path('examples/report-power-artifacts/report/summary.json').read_text())
print('history_runs=', len(history))
print('from=', summary['comparison']['previousRunId'])
print('to=', summary['comparison']['currentRunId'])
print('pass_rate=', round(summary['summary']['passRate'] * 100, 2))
PY
```

3) Extract triage-focused row details.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('examples/report-power-artifacts/report/summary.json').read_text())
print('--- persistent failures ---')
for row in summary['comparison'].get('persistentFailures', []):
  print(row['id'], '|', row.get('reason'))
print('--- rows absent from current run (id churn or removed cases) ---')
for row in summary['comparison'].get('disappeared', []):
  print(row['id'], '|', row.get('category'))
print('--- newly passing rows (true improvements) ---')
for row in summary['comparison'].get('newlyPassing', []):
  print(row['id'], '|', row.get('category'))
PY
```

4) Confirm gating status used by reviewer.

```sh
python3 - <<'PY'
import json
from pathlib import Path
gate = json.loads(Path('examples/report-power-artifacts/gates/check-pass.json').read_text())
print('gate_passed=', gate['passed'])
print('diagnostics=', gate.get('diagnostics', []))
PY
```

## Expected outputs (verified against a real run)

- History confirms cross-run comparison context.
- Progress data identifies run-to-run movement.
- Row-level details identify remaining risk, id churn/removals, and resolved issues.
- Gate output provides binary reviewer decision signal.
- In this fixture, `newlyPassing=[]` and `disappeared` has 4 rows
  (`rq-fail-2`, `rq-fail-4`, `tu-fail-1`, `tu-fail-2`). **Do not read that as
  4 improvements.** `disappeared` means those row ids are no longer present
  in the current run's dataset — the row was removed, renamed, or the
  suite changed shape. It is evidence of change, not evidence of a fix. Only
  `newlyPassing` (same row id, was failing, now passing) is a confirmed
  improvement. A reviewer who reports "4 issues resolved" from this fixture
  would be wrong; the correct note is "2 persistent failures unchanged, 4
  rows absent from this run — confirm with the dataset owner whether they
  were intentionally removed before counting them as progress."

## Common mistakes

- **Reporting `disappeared` rows as resolved issues.** This fixture's 4
  disappeared rows are absent from the dataset, not confirmed fixed.
- **Skipping the history/baseline pull.** Without `previousRunId`, "improved"
  or "regressed" has no reference point and is just an opinion.
- **Quoting only the gate's pass/fail bit in a review comment.** Reviewers
  need the row-level reasons, not just the binary verdict.

## Definition of done

You can explain the concept of comparison triage and produce a short PR note
with gate decision, top persistent failures, and a `disappeared` count that
is explicitly *not* claimed as improvements unless corroborated by
`newlyPassing` or a dataset-owner confirmation.