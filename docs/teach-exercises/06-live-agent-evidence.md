# Exercise 06: Capture live agent evidence

Goal
- Add one row with `turns[]` and `toolCalls[]`.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- Final answer alone hides many failures.
- Tool and turn evidence shows what really happened.

Steps
1) Add an agent trajectory row.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['suites'].append({
  'id': 'mcp-routing',
  'name': 'mcp-routing',
  'total': 1,
  'passed': 1,
  'failed': 0
})
doc['rows'].append({
  'id': 'agent-trajectory-001',
  'suite': 'mcp-routing',
  'passed': True,
  'kind': 'agent',
  'severity': 'none',
  'category': 'success',
  'input': 'Find current account balance and summarize risk profile.',
  'output': 'Balance is £12,400. Risk profile: moderate.',
  'turns': [
    {'role': 'user', 'content': 'Find current account balance and summarize risk profile.'},
    {'role': 'assistant', 'content': 'I will check the account service.'},
    {'role': 'tool', 'content': 'lookup complete', 'toolCall': {'name': 'account.lookup', 'args': {'accountId': 'ACC-001'}}, 'toolResult': 'balance=12400;risk=moderate'}
  ],
  'toolCalls': [
    {'name': 'account.lookup', 'args': {'accountId': 'ACC-001'}, 'result': 'balance=12400;risk=moderate', 'resultIsError': False, 'durationMs': 85}
  ]
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
- Row exists with both `turns` and `toolCalls`.
- Lint accepts the artifact.