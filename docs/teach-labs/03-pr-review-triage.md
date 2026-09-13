# Lab 03: PR review triage

Concept

PR triage is comparison analysis: what got worse, what stayed broken, and what improved.

Why this matters

Without structured comparison, reviewers focus on loud failures and miss persistence, regressions, or ID churn that affects confidence.

Lab question

Can you produce a reviewer-ready triage note from run-to-run evidence?

Lab outline

1. Refresh artifacts.
2. Read history and run comparison context.
3. Extract persistent, disappeared, and newly passing rows.
4. Confirm the gate status used by reviewers.

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

## Expected outputs

- History confirms cross-run comparison context.
- Progress data identifies run-to-run movement.
- Row-level details identify remaining risk, id churn/removals, and resolved issues.
- Gate output provides binary reviewer decision signal.
- In this fixture, `newlyPassing` can be empty because improvements can appear under `disappeared` when row IDs changed between runs.

## Definition of done

You can explain the concept of comparison triage and produce a short PR note with gate decision, top persistent failures, and improvements.