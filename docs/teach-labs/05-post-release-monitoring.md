# Lab 05: Post-release monitoring

Goal
- Use run history and gate outputs as a post-release monitoring loop.

## Steps

1) Regenerate artifacts and confirm latest report exists.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Build a monitoring snapshot.

```sh
rm -rf .tmp/post-release-monitor
pnpm cli:dev history --input=examples/report-power-artifacts/.evals_output --out=.tmp/post-release-monitor/history.json
pnpm cli:dev report --input=examples/report-power-artifacts/.evals_output --reporter=json-summary --report-dir=.tmp/post-release-monitor
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/post-release-monitor/check.json
```

3) Compute watch signals.

```sh
python3 - <<'PY'
import json
from pathlib import Path
hist = json.loads(Path('.tmp/post-release-monitor/history.json').read_text())
summary = json.loads(Path('.tmp/post-release-monitor/summary.json').read_text())
check = json.loads(Path('.tmp/post-release-monitor/check.json').read_text())
print('history_runs=', len(hist))
print('latest_run=', summary['summary']['run']['id'])
print('pass_rate=', round(summary['summary']['passRate'] * 100, 2))
print('gate_passed=', check['passed'])
print('persistent_failures=', len(summary['comparison'].get('persistentFailures', [])))
print('disappeared=', len(summary['comparison'].get('disappeared', [])))
PY
```

4) Emit a concise monitoring alert payload.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('.tmp/post-release-monitor/summary.json').read_text())
payload = {
  'runId': summary['summary']['run']['id'],
  'passRate': summary['summary']['passRate'],
  'previousRunId': summary['comparison'].get('previousRunId'),
  'persistentFailureIds': [r['id'] for r in summary['comparison'].get('persistentFailures', [])],
  'baselineMissingRowIds': [r['id'] for r in summary['comparison'].get('disappeared', [])],
  'newlyPassingRowIds': [r['id'] for r in summary['comparison'].get('newlyPassing', [])],
}
print(json.dumps(payload, indent=2))
PY
```

## Expected outputs
- Monitoring snapshot contains history, summary, and check artifacts.
- Alert payload references persistent row IDs plus baseline-missing or newly-passing IDs.
- Gate status and pass-rate trend are explicit in machine-readable form.
- `newlyPassingRowIds` may be empty in this fixture when improvements manifest as baseline-missing rows due to ID churn.

## Definition of done
You can run this loop on a schedule and produce a deterministic monitoring payload grounded in artifacts.