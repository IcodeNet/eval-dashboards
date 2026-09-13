# Lab 04: Release readiness

Concept

Release readiness is an evidence packet, not a single green check.

Why this matters

A release can pass one gate and still carry unresolved persistent failures or weak trend confidence. Teams need a packet that combines gate, history, progress, and row rationale.

Lab question

Can you build a release packet that another stakeholder can validate independently?

Lab outline

1. Refresh deterministic artifacts.
2. Build a fresh release bundle.
3. Summarize confidence signals from machine outputs.
4. Extract row-level blockers for release notes.

## Steps

1) Regenerate deterministic report-power artifacts.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Generate a fresh report bundle in a temporary release folder.

```sh
rm -rf .tmp/release-readiness
pnpm cli:dev report --input=examples/report-power-artifacts/.evals_output --reporter=html --reporter=json-summary --reporter=markdown-summary --report-dir=.tmp/release-readiness
pnpm cli:dev history --input=examples/report-power-artifacts/.evals_output --out=.tmp/release-readiness/history.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/release-readiness/check.json
```

3) Produce a release confidence summary from machine outputs.

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

4) Inspect row-level blockers for release notes.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('.tmp/release-readiness/summary.json').read_text())
for row in summary['comparison'].get('persistentFailures', []):
  print(f"{row['id']} | severity={row['severity']} | reason={row.get('reason')}")
PY
```

## Expected outputs

- `.tmp/release-readiness/check.json` exists and shows gate status.
- `.tmp/release-readiness/history.json` confirms retained run history.
- `.tmp/release-readiness/summary.json` contains progress and row-level detail analysis.
- `.tmp/release-readiness/index.html` is available for human sign-off.

## Definition of done

You can explain why release readiness is a packet, then hand a stakeholder machine-verifiable gate result + history/progress evidence + row-level rationale.