# Exercise 10: Complete one iteration loop

Goal
- Fix one failing row.
- Record why the change was made.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- Evals are useful only if they help you improve safely.

Steps
1) Update one row to pass and add a clear reason.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-002.json')
doc = json.loads(p.read_text())
for row in doc.get('rows', []):
  if row.get('id') == 'case-001':
    row['passed'] = True
    row['severity'] = 'none'
    row['category'] = 'success'
    row['reason'] = 'Fixed rubric wording to remove ambiguity around accepted answer format.'

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

2) Write a short change note.

```sh
mkdir -p eval/notes
cat > eval/notes/10-iteration-change-log.md <<'EOF'
Change: clarified rubric wording for case-001.
Why: previous wording caused false regression classification.
Expected impact: deterministic check should pass with unchanged agent behavior.
EOF
```

3) Re-run the gate.

```sh
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --zero-critical
```

Why no `--max-new-failures` here:
- This exercise does not set a baseline run on purpose.
- A baseline-aware new-failure gate is covered in Exercise 09 history workflow.

Example result
- Commands run without schema errors.
- Artifact is updated as described in the goal.

Definition of done
- Row `case-001` is now passing with explicit rationale.
- The change note exists and is readable by another teammate.