# Exercise 09: Build history from two runs

## What this exercise teaches

1. History requires at least two runs with an explicit, stable baseline
   `run.id` — `--baseline-run-id` only works if you set it yourself.
2. `history` and `check --baseline-run-id` read the same `.evals_output`
   directory but answer different questions: one records trend, the other
   gates on it.
3. A regression is not automatic — you must intentionally flip a row's
   `passed`/`severity`/`reason` to see what a real new-failure gate failure
   looks like.

## Question this answers

Given two runs in the same folder, how do I produce a persisted history file
and a gate result that tells me whether the second run introduced a new
failure versus the first?

Goal

How to read the check output
| Field | Meaning |
| --- | --- |
| `New failures 1 exceed allowed 0` | A row that passed in the baseline run now fails; the count, not the row id, drives the gate |
| `Top failing categories` | Groups the new/current failures by `category` so you see the shape, not just a count |
| `Lint warning breakdown` | Taxonomy completeness warnings from the same run, shown for context, not blocking the gate |
| `exit=1` | The process exit code the gate itself returns; anything non-zero fails CI |

- Create at least two run files.
- Generate report and history outputs.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 08; this exercise renames that artifact into run-001/run-002.

Why this matters
- You cannot reason about regression from one run only.

Steps
1) Rename the initial file to run-001 and create run-002 with a small change.

Why rename: this keeps a clean two-run history set for this exercise.

```sh
mv .evals_output/run-minimal.json .evals_output/run-001.json

python3 - <<'PY'
import json
from pathlib import Path
src = Path('.evals_output/run-001.json')
dst = Path('.evals_output/run-002.json')

# Make baseline id explicit so --baseline-run-id is deterministic
base = json.loads(src.read_text())
base['run']['id'] = 'local-minimal-001'
base['run']['generatedAt'] = '2026-09-13T00:00:00.000Z'
src.write_text(json.dumps(base, indent=2) + '\n')

doc = json.loads(src.read_text())
doc['run']['id'] = 'local-minimal-002'
doc['run']['generatedAt'] = '2026-09-13T00:10:00.000Z'
if doc['rows']:
  doc['rows'][0]['passed'] = False
  doc['rows'][0]['severity'] = 'high'
  doc['rows'][0]['category'] = 'regression'
  doc['rows'][0]['reason'] = 'Intentional regression example for history demo'

# Recompute suite totals after edits so counts match rows
from collections import defaultdict
stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0})
for r in doc.get('rows', []):
  if isinstance(r, dict) and r.get('suite'):
    stats[r['suite']]['total'] += 1
    if r.get('passed') is True:
      stats[r['suite']]['passed'] += 1
    else:
      stats[r['suite']]['failed'] += 1
for suite in doc.get('suites', []):
  sid = suite.get('id')
  if sid in stats:
    suite['total'] = int(stats[sid]['total'])
    suite['passed'] = int(stats[sid]['passed'])
    suite['failed'] = int(stats[sid]['failed'])
dst.write_text(json.dumps(doc, indent=2) + '\n')
PY
```

2) Generate outputs.

```sh
npx eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-dashboard
npx eval-dashboards history --input=.evals_output --out=eval-dashboard/history.json
npx eval-dashboards check --input=.evals_output --baseline-run-id=local-minimal-001 --max-new-failures=0 --zero-critical
```

Example result (verified against a real run)
- `history.json` contains 2 run entries.
- Baseline-aware check reports:

```text
Eval gates failed:
New failures 1 exceed allowed 0 (key=row, raw=1).
Diagnostics:
Top failing categories: regression=1
Lint warning breakdown: missing-suite-manifest=3, missing-agent-versioning=1, low-category-coverage=1
```
- Exit code `1` in this demo, because `run-002.json`'s only changed row
  (`case-001`) flips from pass to fail relative to baseline `local-minimal-001`.

Definition of done
- `run-001.json` and `run-002.json` both exist.
- `eval-dashboard/history.json` has multiple entries.
- Baseline-aware new-failure check runs with an explicit baseline id.
- In this intentional-regression demo, this check can fail with exit code `1` (expected).

Common mistakes
- Omitting `--baseline-run-id` and expecting `check` to guess which run is
  the baseline — without it, there is no "new failure" comparison at all.
- Forgetting to recompute suite `total`/`passed`/`failed` after flipping a
  row's `passed` field, so the suite summary silently disagrees with the
  rows underneath it.
- Reading a nonzero exit code from `check` here as a bug — it is the
  expected outcome of the intentional regression this exercise creates.