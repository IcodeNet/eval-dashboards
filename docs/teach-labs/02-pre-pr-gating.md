# Lab 02: Pre-PR gating

Concept

A gate is a policy decision over evidence, not a generic test failure.

## What this lab teaches

1. **A gate threshold is a policy choice, not a property of the run.** The same
   97.33% pass rate is "merge-eligible" at one threshold and "blocked" at
   another — the artifact never changes.
2. **Gate JSON must carry a baseline reference.** Without `baselineRunId`, a
   "pass" or "fail" verdict cannot be audited against what it was compared to.
3. **A gate decision is incomplete without row-level evidence.** "Blocked"
   alone doesn't tell a reviewer what to fix; the persistent-failure rows do.

Why this matters

Teams often block or merge PRs using intuition. This lab teaches how to make the same decision deterministically from machine outputs and baseline context.

Lab question

Can you justify merge-eligible vs blocked with explicit thresholds and row evidence?

Lab outline

1. Refresh deterministic artifacts. (evidence class: all four)
2. Run check with two threshold settings. (evidence class: gate decision)
3. Produce a decision record from machine JSON. (evidence class: gate decision)
4. Link decision back to persistent failing rows. (evidence class: row detail)

Why these two thresholds

This lab's fixture run passes at 97.33%. `0.95` and `0.99` were picked to
straddle it deliberately: `0.95` sits below the actual pass rate (gate
passes), `0.99` sits above it (gate fails). This is not a real team's
threshold — a threshold is a negotiated risk position your team sets based
on what a regression at that suite actually costs, not a number copied from
this lab. The point of running both is to see the same evidence produce
opposite decisions, so you internalize that the artifact doesn't decide
anything by itself — the threshold does.

## Steps

1) Refresh artifacts.

```sh
./scripts/generate-report-power-artifacts.sh
```

2) Re-run gate checks directly to mirror CI behavior.

```sh
rm -rf .tmp/lab-prepr-pass.json .tmp/lab-prepr-fail.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/lab-prepr-pass.json
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.99 --max-new-failures=0 --zero-critical --json-out=.tmp/lab-prepr-fail.json || true
```

3) Produce a decision record from machine outputs.

```sh
python3 - <<'PY'
import json
from pathlib import Path
pass_doc = json.loads(Path('.tmp/lab-prepr-pass.json').read_text())
fail_doc = json.loads(Path('.tmp/lab-prepr-fail.json').read_text())
print('decision@0.95:', 'merge-eligible' if pass_doc['passed'] else 'blocked')
print('decision@0.99:', 'merge-eligible' if fail_doc['passed'] else 'blocked')
print('baseline:', pass_doc.get('baselineRunId'))
print('diagnostics:', fail_doc.get('diagnostics', []))
PY
```

4) Tie gate decision to row-level evidence.

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('examples/report-power-artifacts/report/summary.json').read_text())
for row in summary['comparison'].get('persistentFailures', []):
  print(f"{row['id']} | suite={row['suite']} | severity={row['severity']} | category={row.get('category')}")
PY
```

## Expected outputs

- Pass and fail gate JSON files both exist.
- Gate decision changes when threshold changes.
- Baseline run id is explicit in gate output.
- Persistent failing rows are listed with IDs and categories.

## Common mistakes

- **Copying `0.95`/`0.99` into a real team's config.** These values were picked
  to straddle this fixture's 97.33% pass rate for teaching purposes, not
  because they represent a sound risk threshold for any real suite.
- **Treating "blocked" as self-explanatory.** A blocked decision without the
  attached persistent-failure rows gives a reviewer nothing actionable.
- **Forgetting `|| true` on the intentionally-failing command.** Without it,
  the failing `check` call aborts the script instead of producing the JSON
  you need for step 3.

## Definition of done

You can explain why the concept is policy-over-evidence, then justify a pre-PR block/allow decision with gate JSON + row evidence + baseline context.