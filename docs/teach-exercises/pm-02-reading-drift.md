# Reading track B: comparing two reports over time

Audience
- Product managers, reviewers, and anyone who approves releases without
  writing eval code. Do reading track A (`pm-01-reading-a-report.md`) first —
  this assumes you can already read one report.

What you need
- A browser.
- Two sample reports, generated from two different runs of the same suite:

```sh
npx eval-dashboards report --input=examples/diagnose-a-red-run/.evals_output \
  --run-id=run-003 --reporter=html --report-dir=eval-dashboard-good
npx eval-dashboards report --input=examples/diagnose-a-red-run/.evals_output \
  --run-id=run-004 --reporter=html --report-dir=eval-dashboard-red
open eval-dashboard-good/index.html
open eval-dashboard-red/index.html
```

There is no single dashboard that shows history or drift over time — this
package's HTML reporter reports on one run at a time. "Watching quality over
time" means generating a report after every run and comparing the header
strip by eye, or feeding `history.json` into your own alerting (see
`teach-labs/05-post-release-monitoring.md`). This exercise teaches the eye
comparison, since it is what you will actually do most weeks.

## The two header strips

`eval-dashboard-good/index.html`:
```text
Pass rate 92.3%   Passed 12/13   New failures 0   New passes 1   Baseline compatible
```

`eval-dashboard-red/index.html`:
```text
Pass rate 61.5%   Passed 8/13   New failures 4   New passes 0   Baseline blocked
```

Same suite, same 13 rows, two different runs. Read them side by side.

## Question 1: which number moved, and by how much?

Pass rate dropped from 92.3% to 61.5% — a 30.8-point drop. That is the number
a dashboard or Slack digest would show you. It is real and it is bad, but it
is not yet the whole story.

## Question 2: is the drop trustworthy?

Check the **Baseline** chip on each report.

- The good run says `Baseline compatible` — its regression count (`New
  failures`, `New passes`) is comparing like with like.
- The red run says `Baseline blocked` — same as reading track A's sample.
  When the baseline is blocked, `New failures 4` is not a confirmed
  regression count; it is a diff against a dataset that changed shape. Do not
  read the two side by side as "13.3 points of that drop are the 4 new
  failures" — you cannot allocate the drop that way when the comparison is
  invalidated.

This is the same trap as reading track A, but it is easier to miss when you
are staring at two reports and a big pass-rate delta looks self-explanatory.
A blocked baseline blocks the explanation, not just the count.

## Question 3: what can you say with confidence?

You can say, without needing the baseline to be trustworthy:
- The pass rate dropped substantially between these two runs.
- One `medium`-severity row was failing in both runs (the persistent
  failure) — it did not cause the drop, it predates it.
- No `critical`-severity row exists in either run.

You cannot yet say:
- Exactly how many rows regressed versus how many are dataset churn.
- Whether this is one bug hitting four cases or four unrelated bugs.

The ask is the same as reading track A: get the baseline compatible again
(rebaseline on the current dataset version), then re-read the new-failures
count. Approving or blocking a release on the raw pass-rate delta alone,
while the baseline chip says blocked, is the mistake this exercise exists to
prevent.

## Practice

Open both reports and answer without looking at the answer below:

1. What is the pass-rate delta between the two runs?
2. Does the delta on its own tell you how many rows regressed? Why or why not?
3. Which single row is failing in both runs, and what does that tell you
   about when to worry about it?
4. What is the one action that would let you trust the `New failures` count
   on the red run?

<details>
<summary>Answers</summary>

1. 30.8 points (92.3% -> 61.5%).
2. No. The red run's baseline is blocked, so `New failures 4` compares two
   different dataset shapes, not a clean before/after.
3. The persistent `medium`-severity failure — it appears in both runs, so it
   is a known, pre-existing issue, not something this release caused.
4. Rebaseline against the current dataset version, then re-read `New
   failures` on a report generated after that.

</details>

Definition of done
- You can read a pass-rate delta between two reports without assuming it
  equals the new-failures count.
- You check the baseline chip on both reports before trusting either one's
  regression count.
- You can name the one row that is a known pre-existing issue versus rows
  that might be new.
