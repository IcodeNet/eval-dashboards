# Exercise 07: Add judge and calibration rows

Goal
- Add one `llm-judge` row.
- Add one calibration row with `groundTruth*` fields.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- Judge output without calibration can be misleading.
- Calibration rows let you measure judge quality later.

Steps
1) Add both rows.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['suites'].append({
  'id': 'answer-quality',
  'name': 'answer-quality',
  'total': 1,
  'passed': 1,
  'failed': 0
})
doc['suites'].append({
  'id': 'judge-calibration',
  'name': 'judge-calibration',
  'total': 1,
  'passed': 1,
  'failed': 0
})
doc['rows'].append({
  'id': 'judge-row-001',
  'suite': 'answer-quality',
  'passed': True,
  'kind': 'llm-judge',
  'severity': 'low',
  'category': 'quality',
  'judgeModel': 'example-judge-model-v1',
  'judgeVerdict': True,
  'judgeReasoning': 'Answer is complete and directly addresses user intent.',
  'axisScores': {'correctness': 0.93, 'clarity': 0.91}
})
doc['rows'].append({
  'id': 'judge-calibration-001',
  'suite': 'judge-calibration',
  'passed': True,
  'kind': 'human-review',
  'severity': 'none',
  'category': 'calibration',
  'groundTruthVerdict': True,
  'groundTruthCategory': 'quality',
  'groundTruthAnnotation': 'Human reviewer confirms answer is acceptable.',
  'groundTruthAxisScores': {'correctness': 0.95, 'clarity': 0.9}
})

# Recompute suite totals from rows to keep counts consistent
from collections import defaultdict
stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0})
for r in doc.get('rows', []):
    if isinstance(r, dict) and r.get('suite'):
        s = stats[r['suite']]
        s['total'] += 1
        if r.get('passed') is True:
            s['passed'] += 1
        else:
            s['failed'] += 1
for suite in doc.get('suites', []):
    sid = suite.get('id')
    if sid in stats:
        suite['total'] = int(stats[sid]['total'])
        suite['passed'] = int(stats[sid]['passed'])
        suite['failed'] = int(stats[sid]['failed'])
p.write_text(json.dumps(doc, indent=2) + '\n')
PY
```

2) Validate.

```sh
npx eval-dashboards lint --input=.evals_output
```

Example result
- Commands run without schema errors.
- Artifact is updated as described in the goal.

Definition of done
- One `llm-judge` row exists with model/verdict/reasoning/axis scores.
- One calibration row exists with `groundTruthVerdict`, `groundTruthCategory`, `groundTruthAnnotation`.