# Exercise 04: Upgrade one row to taxonomy-complete

Goal
- Take one minimal row and make it taxonomy-complete.
- Verify lint warnings decrease for that row.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Plain-English theory
- "Minimal valid" means the row can load.
- "Taxonomy-complete" means the row is useful for debugging, ownership, and trends.
- A complete row answers: what failed, how bad, why, and under which dataset/rubric.

Row fields to add
1) Classification
- `kind`: what type of eval row this is
- `severity`: impact level
- `category`: machine-friendly failure/success label

2) Governance IDs
- `datasetId`: dataset version identity
- `scenarioId`: scenario identity inside the dataset
- `rubricId`: scoring/rubric identity

3) Evidence (deterministic row)
- `input`, `output`, `expected`, `reason`

Steps
1) Update the first row in `.evals_output/run-minimal.json`.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['rows'][0].update({
  'kind': 'deterministic',
  'severity': 'none',
  'category': 'success',
  'datasetId': 'starter-dataset-v1',
  'scenarioId': 'case-001',
  'rubricId': 'starter-rubric-v1',
  'input': 'What is 2+2?',
  'output': '4',
  'expected': '4',
  'reason': 'Exact-match deterministic check passed'
})
p.write_text(json.dumps(doc, indent=2) + '\n')
PY
```

2) Run lint.

```sh
npx eval-dashboards lint --input=.evals_output
```

3) Inspect that row.

```sh
python3 - <<'PY'
import json
from pathlib import Path
row = json.loads(Path('.evals_output/run-minimal.json').read_text())['rows'][0]
for k in ['id','suite','passed','kind','severity','category','datasetId','scenarioId','rubricId','input','output','expected','reason']:
    print(f"{k}: {row.get(k)}")
PY
```

Example result
- Row `case-001` now has classification + governance + evidence fields.
- Lint shows fewer taxonomy missing-field warnings for this row.

Definition of done
- You can explain each added field in one sentence.
- Another beginner can read the row and understand what happened without extra context.

Common mistakes
- Using unstable IDs (they should stay stable across runs).
- Putting big vendor payloads in top-level fields (use `metadata` for vendor-specific extras).
- Forgetting `reason` (human-readable failure context).