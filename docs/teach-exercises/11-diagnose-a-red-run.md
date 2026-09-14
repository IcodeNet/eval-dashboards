# Exercise 11: Diagnose a red run

Goal
- Take one failing run and name each distinct cause.
- Decide the right response for each, instead of re-running until green.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 09 (reports and history), because this exercise compares runs.

Why this matters

A red gate is not one problem. A single run can fail because the world moved
(dataset changed), because the agent genuinely got worse, or because some rows
were never reliable. Those three need opposite responses. Re-running until the
build goes green hides all of them.

The fixture

`examples/diagnose-a-red-run/.evals_output/` holds four runs of the same agent.
Runs 001-003 are healthy history. Run 004 is the red run you must diagnose.

Copy it into your working directory:

```sh
cp -r examples/diagnose-a-red-run/.evals_output .
```

## Step 1: Reproduce the red run

```sh
npx eval-dashboards check --input=.evals_output \
  --min-pass-rate=0.9 --zero-critical --max-new-failures=0 \
  --statistical-mode=bootstrap --min-pass-rate-delta=0 \
  --no-calibration-preflight
```

Expected output (exit code 1):

```text
Eval gates failed:
Pass rate 0.615 is below required 0.900.
New failures 4 exceed allowed 0 (key=row, raw=4).
Baseline compatibility is blocked due to dataset/rubric version drift.
Suite "answer-quality" pass rate 0.500 is below blocking threshold passRate=0.900.
Diagnostics:
Top failing categories: incomplete-answer=5
Statistical gate (bootstrap, confidence=0.95, samples=2000): observed ΔpassRate=-0.308, CI=[-0.615, 0.000], required min Δ=0.000.
```

Four failure lines, but they are not four problems. Work out how many there are.

## Step 2: Separate the causes

Answer these before reading the next section.

1. `Baseline compatibility is blocked`. Compare `suiteManifests[0].datasetVersion`
   in `run-003.json` and `run-004.json`. Does this line tell you the agent got
   worse?
2. The statistical gate reports `ΔpassRate=-0.308` with `CI=[-0.615, 0.000]`.
   The upper bound touches zero. What does that say about confidence that a real
   regression occurred?
3. Build the history and look at row stability:

```sh
npx eval-dashboards history --input=.evals_output --history-dir=eval-report
python3 -c "import json;print(json.load(open('eval-report/history.json'))[-1]['rowStability'])"
```

   You should see `{'stable': 8, 'flaky': 4, 'persistentFailure': 1}`.
   Which failing rows deserve an engineering fix, and which deserve a dataset fix?

4. Find the row that failed in every single run. Is it a regression?

## Step 3: Check your diagnosis

<details>
<summary>Expected conclusions</summary>

**Cause 1 - the comparison is invalid.** `run-003` used `ds-quality-3.1`;
`run-004` used `ds-quality-4.0`. The dataset changed underneath the run, so
"new failures 4" compares two different question sets. Baseline compatibility is
`blocked` for exactly this reason. Until the baseline is rebuilt on the new
dataset version, the new-failure count and the pass-rate delta are not evidence
about the agent at all. **Response: rebaseline, do not debug the agent yet.**

**Cause 2 - the statistical gate is inconclusive, not damning.** The observed
drop is 0.308, but the confidence interval runs to 0.000. The gate fails because
the upper bound is not above the required delta, which is the correct
conservative behaviour. It does not prove a regression. With 10 rows per suite
the sample is too small to distinguish a real drop from noise.
**Response: more rows, not a hotfix.**

**Cause 3 - one row has never passed.** `q-09` fails in all four runs, so it is a
`persistentFailure`, not a regression. It was red before this change and is
unrelated to it. **Response: fix it or waive it deliberately, but do not let it
keep blocking unrelated work.**

**Cause 4 - four rows are flaky.** `q-07` alternates pass/fail across runs with
no code change. Three more rows (`q-02`, `q-04`, `q-05`) fail only in `run-004`,
so on this window they read as flaky too. Flaky rows are a measurement defect:
an ambiguous rubric, a non-deterministic prompt, or an under-specified expected
answer. **Response: fix the rubric or the dataset row. Never "fix" flakiness by
loosening the gate.**

So: four failure lines, but only one of them is a candidate agent regression, and
even that one is unproven until the baseline is valid.

</details>

## Step 4: Act on the diagnosis

The correct sequence is to remove the invalid comparison first, then re-measure.

```sh
# 1) Acknowledge the dataset bump: the old baseline cannot be compared.
#    In real work you would record this decision, then set the new run as baseline.
npx eval-dashboards check --input=.evals_output \
  --min-pass-rate=0.9 --zero-critical --allow-blocked-baseline \
  --no-calibration-preflight
```

Note this still fails on pass rate, and it should. Suppressing the baseline
error does not make the suite healthy. It only removes the one signal you have
already explained.

Write down your decisions:

```sh
mkdir -p eval/notes
cat > eval/notes/11-red-run-diagnosis.md <<'EOF'
Run: run-004
Causes identified:
1. Dataset bumped 3.1 -> 4.0. Baseline invalid. Action: rebaseline on 4.0.
2. Statistical gate inconclusive (CI upper bound 0.000). Action: grow dataset.
3. q-09 persistent failure, pre-existing. Action: fix or record an explicit waiver.
4. q-07 (+3 others) flaky. Action: tighten rubric wording, not the threshold.
Agent regression confirmed? No - not measurable until 1 is resolved.
EOF
```

Example result
- `check` exits 1 and prints the four failure lines above.
- `rowStability` reports `stable: 8, flaky: 4, persistentFailure: 1`.
- Your diagnosis note names a different action for each cause.

Definition of done
- You can state which failure lines share a single root cause.
- You can explain why `--allow-blocked-baseline` is not a fix.
- You never proposed lowering `--min-pass-rate` to make the run pass.
