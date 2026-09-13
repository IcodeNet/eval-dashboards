# Exercise 05: Add suite governance metadata

Goal
- Add `suiteManifests[]` for one safety suite and one quality suite.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- Suite metadata explains gate intent.
- It also improves baseline compatibility checks.

Steps
1) Add two manifests.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['suiteManifests'] = [
  {
    'name': 'refusal-safety',
    'target': 'agent',
    'riskArea': 'prompt-safety',
    'datasetSource': 'synthetic',
    'datasetVersion': 'safety-v1',
    'rubricVersion': 'safety-rubric-v1',
    'graders': ['deterministic-assertions'],
    'gate': {'mode': 'blocking', 'thresholds': {'passRate': 1.0, 'zeroCritical': 0}}
  },
  {
    'name': 'answer-quality',
    'target': 'conversation',
    'riskArea': 'response-quality',
    'datasetSource': 'synthetic',
    'datasetVersion': 'quality-v1',
    'rubricVersion': 'quality-rubric-v1',
    'graders': ['llm-judge'],
    'gate': {'mode': 'report-only', 'thresholds': {'passRate': 0.9}}
  }
]
p.write_text(json.dumps(doc, indent=2) + '\n')
PY
```

2) Verify manifests exist.

```sh
python3 - <<'PY'
import json
from pathlib import Path
m = json.loads(Path('.evals_output/run-minimal.json').read_text()).get('suiteManifests', [])
print('suiteManifests:', len(m))
for x in m:
    print(x['name'], x['gate']['mode'])
PY
```

Example result
- Commands run without schema errors.
- Artifact is updated as described in the goal.

Definition of done
- You have one blocking safety suite and one report-only quality suite.
- Dataset and rubric versions are explicit.