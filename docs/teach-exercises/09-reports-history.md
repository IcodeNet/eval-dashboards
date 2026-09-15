# Exercise 09: Build history from two runs

Goal
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

Example result
- `history.json` contains at least two run entries.
- Baseline-aware check reports one new failure and exits with code `1` in this demo.

Definition of done
- `run-001.json` and `run-002.json` both exist.
- `eval-dashboard/history.json` has multiple entries.
- Baseline-aware new-failure check runs with an explicit baseline id.
- In this intentional-regression demo, this check can fail with exit code `1` (expected).