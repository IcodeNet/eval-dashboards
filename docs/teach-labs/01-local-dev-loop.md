# Lab 01: Local dev loop

Goal
- Run the local loop and capture history, progress, gating, and row-level details from real artifacts.

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

## Expected outputs
- `history.json` contains 2 runs.
- `summary.json` includes `comparison.previousRunId`, `persistentFailures`, and `disappeared`.
- `check-pass.json` has `passed: true`.
- `check-fail.json` has `passed: false` with a threshold reason.
- `index.html` opens locally for human triage.

## Definition of done
You can show all four evidence classes from files in `examples/report-power-artifacts/` without re-running a hosted service.