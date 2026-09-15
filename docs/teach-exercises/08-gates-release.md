# Exercise 08: Run gates for release decisions

Goal
- Run lint, check, and report in order.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 07; this exercise gates the artifact built by 02-07.

Why this matters
- `lint` catches shape and taxonomy issues early.
- `check` enforces quality bars.
- `report` produces human + machine output for review.
- Gates only fail when the artifact actually has a failing or critical row.
  Everything you built in Exercises 02–07 passes, so `check` passes too —
  seeing it pass is not a mistake, it is the correct outcome for clean data.

Steps

1) Run gates against your current artifact (everything should pass).

```sh
npx eval-dashboards lint --input=.evals_output
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --zero-critical
npx eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-dashboard
```

Example result (verified against a real run)
```text
Gate diagnostics:
Lint warning breakdown: missing-suite-manifest=2, low-category-coverage=1
Eval gates passed.
```
- Exit code `0`.
- `eval-dashboard/index.html` exists.
- `eval-dashboard/summary.json` exists.

2) Now see a gate actually fail. Add one critical, failing row so you know
   what red looks like before you hit it for real.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['rows'].append({
  'id': 'case-002',
  'suite': 'quality',
  'passed': False,
  'kind': 'deterministic',
  'severity': 'critical',
  'category': 'regression',
  'input': 'What is 10/0?',
  'output': 'undefined',
  'expected': 'error: division by zero',
  'reason': 'Model returned undefined instead of raising a divide-by-zero error.'
})
from collections import defaultdict
stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0})
for r in doc.get('rows', []):
    if isinstance(r, dict) and r.get('suite'):
        s = stats[r['suite']]
        s['total'] += 1
        s['passed' if r.get('passed') is True else 'failed'] += 1
for suite in doc.get('suites', []):
    sid = suite.get('id')
    if sid in stats:
        suite['total'] = stats[sid]['total']
        suite['passed'] = stats[sid]['passed']
        suite['failed'] = stats[sid]['failed']
p.write_text(json.dumps(doc, indent=2) + '\n')
PY
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --zero-critical
```

Example result (verified against a real run)
```text
Eval gates failed:
Pass rate 0.750 is below required 0.900.
Critical failures 1 exceed allowed 0.
Diagnostics:
Top failing categories: regression=1
```
- Exit code `1`.
- Two independent gates tripped from one bad row: the pass-rate floor
  (`--min-pass-rate=0.9`) and the critical-failure ceiling (`--zero-critical`).
  Either one alone would have failed the release.

Definition of done
- You can explain why each command runs in this order.
- You have seen `check` both pass (clean artifact) and fail (one critical row
  added), and can read the diagnostics line that names which threshold tripped.