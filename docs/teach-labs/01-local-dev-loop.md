# Lab 01: Local dev loop

Concept

Local development should produce decision-ready evidence, not only a pass/fail feeling.

Why this matters

If developers do not learn to read history, progress, gates, and row details during local work, teams discover evaluation issues too late in PR or release stages.

Lab question

Can you prove local changes are understood through artifacts before CI is involved?

Lab outline

1. Regenerate deterministic artifacts. (evidence class: all four)
2. Confirm the core evidence files exist. (evidence class: history, progress, gate, row detail)
3. Read progress and row-level comparison signals. (evidence class: progress, row detail)
4. Validate both pass and fail gate outputs. (evidence class: gate decision)

## Steps

1) Regenerate deterministic artifacts.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Check history/progress files exist.

```sh
python3 - <<'PY'
from pathlib import Path
root = Path('examples/report-power-artifacts')
for rel in [
  'report/history.json',
  'report/summary.json',
  'gates/check-pass.json',
  'gates/check-fail.json',
  'report/index.html',
]:
  p = root / rel
  print(rel, 'OK' if p.exists() else 'MISSING')
PY
```

3) Inspect progress over runs and row-level detail in one pass.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('examples/report-power-artifacts/report/summary.json').read_text())
print('run=', summary['summary']['run']['id'])
print('pass_rate=', round(summary['summary']['passRate'] * 100, 2))
print('history_baseline=', summary['comparison']['previousRunId'])
print('persistent_failures=', len(summary['comparison'].get('persistentFailures', [])))
print('disappeared=', len(summary['comparison'].get('disappeared', [])))
PY
```

4) Validate gate outcomes (pass and fail are both expected here).

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('examples/report-power-artifacts/gates/check-pass.json')
f = Path('examples/report-power-artifacts/gates/check-fail.json')
pass_doc = json.loads(p.read_text())
fail_doc = json.loads(f.read_text())
print('pass_gate:', pass_doc['passed'])
print('fail_gate:', fail_doc['passed'])
print('fail_reasons:', fail_doc['failures'])
PY
```

## Expected outputs (verified against a real run)

- `history.json` contains 2 runs.
- `summary.json` includes `comparison.previousRunId`, `persistentFailures`, and `disappeared`.
- `disappeared=4` here, with `newlyPassing=[]`. That is 4 rows present in the
  baseline (`agent-v3-2026-07-30`) that are absent from this run
  (`agent-v4-2026-07-31`) — real ids: `rq-fail-2`, `rq-fail-4`, `tu-fail-1`,
  `tu-fail-2`. This is **not** four fixed bugs. Rows disappear when a dataset
  or suite changes shape between runs (renamed/removed cases), not only when
  an agent improves. Read it together with `persistentFailures` (2 rows still
  failing) before concluding anything got better.
- `check-pass.json` has `passed: true`.
- `check-fail.json` has `passed: false` with a threshold reason.
- `index.html` opens locally for human triage.

## Definition of done

You can explain the concept in one sentence and show all four evidence classes from files in `examples/report-power-artifacts/` without re-running a hosted service.