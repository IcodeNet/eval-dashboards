# Exercise 06: Capture live agent evidence

What this exercise teaches
1. Agent rows need trajectory evidence (`turns[]`, `toolCalls[]`), not just a final `output`.
2. `toolCalls[]` should record args, result, error state, and duration — not just the tool name.
3. Lint treats missing `agentVersion`/`promptVersion` as a warning, not an error, so an agent row can pass lint while still being under-versioned for cross-release comparison.

Question this answers
- What evidence do you need to debug an agent row when the final answer looked fine but the path there was wrong or expensive?

Goal
- Add one row with `turns[]` and `toolCalls[]`.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 05; this exercise edits that artifact further.

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

Example result (verified against a real run)
```text
Eval taxonomy lint passed with warnings (3 warning(s), 0 error(s)):
WARNING [missing-agent-versioning] [run:local-minimal-001] Agent row mcp-routing:agent-trajectory-001 is missing agentVersion/promptVersion.
WARNING [missing-suite-manifest] [run:local-minimal-001] Suite quality has no matching suite manifest.
WARNING [missing-suite-manifest] [run:local-minimal-001] Suite mcp-routing has no matching suite manifest.
```
- Exit code `0`.
- The `missing-agent-versioning` warning is expected: this exercise adds
  `turns`/`toolCalls` but not `agentVersion`/`promptVersion`. Add those two
  fields to the row if you want a fully clean run — they identify which agent
  build and prompt version produced this trajectory, which matters once you
  are comparing runs across releases.
- The two `missing-suite-manifest` warnings are expected too: this exercise's
  fixture doesn't declare suite manifests for `quality`/`mcp-routing`.

Definition of done
- Row exists with both `turns` and `toolCalls`.
- Lint accepts the artifact (exit `0`).

Common mistakes
- Recording only the final tool result and dropping intermediate `turns`,
  which makes it impossible to tell whether the agent retried, backtracked,
  or called tools in a risky order.
- Leaving `resultIsError` unset on a failed tool call instead of `true` —
  this hides real tool failures inside what looks like a normal trajectory.
- Never adding `agentVersion`/`promptVersion` because lint only warns, then
  losing the ability to tell which agent build a regression came from once
  you compare runs across releases.