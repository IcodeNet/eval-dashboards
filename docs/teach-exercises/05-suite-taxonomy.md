# Exercise 05: Add suite governance metadata

What this exercise teaches
1. Suite-level metadata (`suiteManifests[]`) is separate from row-level fields.
2. A manifest can name a suite id that does not exist yet without lint complaining — only the reverse (a suite with no manifest) warns.
3. Attaching a manifest to a suite with existing un-governed rows raises the bar for every row already in it (lifecycle/provenance become required).

Question this answers
- How do you declare gate intent and dataset/rubric versions for a whole suite, not just one row?

Goal
- Add `suiteManifests[]` for one safety suite and one quality suite.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 04; this exercise edits that artifact further.

Why this matters
- Suite metadata explains gate intent.
- It also improves baseline compatibility checks.
- Manifest names must match real suite ids in the artifact for the manifest
  to mean anything. This exercise manifests `answer-quality`, the suite
  Exercise 07 adds next — lint does not warn about a manifest with no
  matching suite yet, only the reverse (a suite with no manifest).
- Manifesting a suite that already has un-governed rows (like `quality`) is a
  bigger step: it makes every existing row in that suite require
  `metadata.lifecycle.status` and `metadata.provenance.source`, or lint hard
  fails. That upgrade is deferred to a later exercise once you are adding
  metadata to rows anyway.

Steps
1) Add a manifest for a suite you are about to add in Exercise 07.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('.evals_output/run-minimal.json')
doc = json.loads(p.read_text())
doc['suiteManifests'] = [
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

3) Validate with lint.

```sh
npx eval-dashboards lint --input=.evals_output
```

Example result (verified against a real run)
```text
Eval taxonomy lint passed with warnings (1 warning(s), 0 error(s)):
WARNING [missing-suite-manifest] [run:...] Suite quality has no matching suite manifest.
```
- Exit code `0`.
- `quality` still warns because it has no manifest yet. `answer-quality`
  produces no warning of its own here — lint only warns about suites that
  lack a manifest, not manifests that lack a suite — so writing the manifest
  ahead of the suite is silent until Exercise 07 adds the `answer-quality`
  suite itself.

Definition of done
- You have one report-only manifest (`answer-quality`) with explicit dataset
  and rubric versions.
- Lint still passes with only `missing-suite-manifest` warnings, no errors.

Common mistakes
- Naming the manifest after a suite id that doesn't match what you add later
  (e.g. `answer_quality` vs `answer-quality`) — the manifest then silently
  never applies to any row, and lint gives no warning to tell you.
- Setting `gate.mode: 'blocking'` on a suite before you have enough rows to
  trust its pass rate — a report-only suite should graduate to blocking only
  after real coverage exists.
- Manifesting a suite that already has rows without adding the required
  `metadata.lifecycle.status` / `metadata.provenance.source` to those
  existing rows first — this immediately turns previously-clean rows into
  lint errors.