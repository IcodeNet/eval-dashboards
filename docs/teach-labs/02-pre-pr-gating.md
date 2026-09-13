# Lab 02: Pre-PR gating

Concept

A gate is a policy decision over evidence, not a generic test failure.

Why this matters

Teams often block or merge PRs using intuition. This lab teaches how to make the same decision deterministically from machine outputs and baseline context.

Lab question

Can you justify merge-eligible vs blocked with explicit thresholds and row evidence?

Lab outline

1. Refresh deterministic artifacts.
2. Run check with two threshold settings.
3. Produce a decision record from machine JSON.
4. Link decision back to persistent failing rows.

## Steps

1) Refresh artifacts.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Re-run gate checks directly to mirror CI behavior.

```sh
rm -rf .tmp/lab-prepr-pass.json .tmp/lab-prepr-fail.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/lab-prepr-pass.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.99 --max-new-failures=0 --zero-critical --json-out=.tmp/lab-prepr-fail.json || true
```

3) Produce a decision record from machine outputs.

```sh
python3 - <<'PY'
import json
from pathlib import Path
pass_doc = json.loads(Path('.tmp/lab-prepr-pass.json').read_text())
fail_doc = json.loads(Path('.tmp/lab-prepr-fail.json').read_text())
print('decision@0.95:', 'merge-eligible' if pass_doc['passed'] else 'blocked')
print('decision@0.99:', 'merge-eligible' if fail_doc['passed'] else 'blocked')
print('baseline:', pass_doc.get('baselineRunId'))
print('diagnostics:', fail_doc.get('diagnostics', []))
PY
```

4) Tie gate decision to row-level evidence.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('examples/report-power-artifacts/report/summary.json').read_text())
for row in summary['comparison'].get('persistentFailures', []):
  print(f"{row['id']} | suite={row['suite']} | severity={row['severity']} | category={row.get('category')}")
PY
```

## Expected outputs

- Pass and fail gate JSON files both exist.
- Gate decision changes when threshold changes.
- Baseline run id is explicit in gate output.
- Persistent failing rows are listed with IDs and categories.

## Definition of done

You can explain why the concept is policy-over-evidence, then justify a pre-PR block/allow decision with gate JSON + row evidence + baseline context.