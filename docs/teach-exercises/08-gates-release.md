# Exercise 08: Run gates for release decisions

What this exercise teaches
1. Gates run in a fixed order for a reason: lint (shape) -> check (thresholds) -> report (output), each catching different classes of problem.
2. A single bad row can trip two independent gates at once (pass-rate floor and critical-failure ceiling); either alone would have blocked release.
3. "Gates pass" only means the thresholds you set were met — it is not proof the artifact has good coverage (a clean but tiny/manifest-incomplete artifact still passes).

Question this answers
- What is the correct order to run lint/check/report, and what does a real gate failure look like versus a real gate pass?

Goal
- Run lint, check, and report in order.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 07; this exercise gates the artifact built by 02-07.

Why this matters
- `lint` catches shape and taxonomy issues early.
- `check` enforces quality bars.
- `report` produces human + machine output for review.
- With the flags used here (`--min-pass-rate`, `--zero-critical`), gates fail
  only when the artifact actually has a failing or critical row. Everything you
  built in Exercises 02–07 passes, so `check` passes too — seeing it pass is not
  a mistake, it is the correct outcome for clean data. Other flags can fail a
  run for different reasons: Exercise 09 adds `--max-new-failures` with a
  baseline, which fails on rows that *regressed* against a previous run even
  when nothing new was added.

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
Lint warning breakdown: missing-suite-manifest=3, missing-agent-versioning=1, low-category-coverage=1
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
Pass rate 0.800 is below required 0.900.
Critical failures 1 exceed allowed 0.
Diagnostics:
Top failing categories: regression=1
Lint warning breakdown: missing-suite-manifest=3, missing-agent-versioning=1, low-category-coverage=1
```
- Exit code `1`.
- Pass rate is `0.800` because the artifact now holds 5 rows (one each from
  Exercises 02/04, 06, and both from 07) and exactly one fails: 4/5 = 0.800.
  If you see a different number, count your rows — a skipped exercise changes
  the denominator, not the lesson.
- Two independent gates tripped from one bad row: the pass-rate floor
  (`--min-pass-rate=0.9`) and the critical-failure ceiling (`--zero-critical`).
  Either one alone would have failed the release.

Definition of done
- You can explain why each command runs in this order.
- You have seen `check` both pass (clean artifact) and fail (one critical row
  added), and can read the diagnostics line that names which threshold tripped.

Common mistakes
- Running `check` before `lint` and missing a taxonomy problem that made the
  pass-rate/critical numbers meaningless in the first place.
- Assuming a passing `check` means the suite is well-covered — it only means
  your configured thresholds (pass rate, zero-critical) were met, not that
  the artifact has enough rows or manifests to trust the number.
- Forgetting that the critical row added in step 2 stays in the artifact for
  later exercises (09, 10) unless explicitly fixed or removed — carrying an
  intentional red row forward without tracking it causes confusing gate
  failures downstream that look unrelated to the exercise you're on.