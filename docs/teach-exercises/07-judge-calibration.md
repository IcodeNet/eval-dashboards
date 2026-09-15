# Exercise 07: Add judge and calibration rows

Goal
- Add one `llm-judge` row.
- Add one calibration row with `groundTruth*` fields.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- Judge output without calibration can be misleading.
- Calibration rows let you measure judge quality later.
- Exercise 05 attached a suite manifest to `answer-quality`. That promotes it
  to a **dataset-governed suite**, which requires every row in it to carry
  `metadata.lifecycle.status` and `metadata.provenance.source` — lint will
  hard-fail (exit 1) without them. This is intentional: once a suite has a
  named dataset owner and rubric version, you need to know whether each row's
  data is live/retired and where it came from, or the governance metadata is
  decorative.

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
  'axisScores': {'correctness': 0.93, 'clarity': 0.91},
  # Required because answer-quality has a suite manifest (Exercise 05) —
  # dataset-governed suites must state row lifecycle and provenance.
  'metadata': {
    'lifecycle': {'status': 'active'},
    'provenance': {'source': 'synthetic'}
  }
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

Example result (verified against a real run)
```text
Eval taxonomy lint passed with warnings (5 warning(s), 0 error(s)):
WARNING [missing-agent-versioning] ...
WARNING [missing-suite-manifest] [run:...] Suite quality has no matching suite manifest.
WARNING [missing-suite-manifest] [run:...] Suite mcp-routing has no matching suite manifest.
WARNING [missing-suite-manifest] [run:...] Suite judge-calibration has no matching suite manifest.
WARNING [low-category-coverage] [run:...] Suite answer-quality category "quality" has 1 row(s); minimum recommended coverage is 2.
```
- Exit code `0`. The warnings are expected at this stage (other suites still
  lack manifests, and one category has only one row) — none of them are
  errors.
- If you skip the `metadata` block above, lint exits `1` with
  `missing-row-lifecycle` and `missing-row-provenance` errors. That failure is
  the point of this exercise, not a bug: try it once without `metadata` to see
  the hard-fail, then add it back.

Definition of done
- One `llm-judge` row exists with model/verdict/reasoning/axis scores, plus
  `metadata.lifecycle.status` and `metadata.provenance.source`.
- One calibration row exists with `groundTruthVerdict`, `groundTruthCategory`, `groundTruthAnnotation`.
- `npx eval-dashboards lint --input=.evals_output` exits `0`.