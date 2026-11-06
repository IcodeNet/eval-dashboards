# Calibration agreement statistics

In source after 0.11.0, reports show raw judge/human agreement, paired counts,
Cohen's kappa, human and judge label counts, and breakdowns by suite, judge
model and human annotation category. These are descriptive by default.

Only rows with boolean `judgeVerdict` and `groundTruthVerdict` values count.
A false/false pair is agreement. A missing or one-sided label is not a pair.

## Read agreement and kappa together

Raw agreement is matching labels divided by paired labels. Unweighted nominal
Cohen's kappa is `(observedAgreement - expectedAgreement) / (1 - expectedAgreement)`.
Expected agreement uses each annotator's observed label frequencies. This is
the definition documented by [scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html);
the implementation adds no Python or other dependency.

For ten human labels with nine true and one false, a judge that always says
true has 90% agreement but kappa zero. Both values matter: the judge has not
demonstrated agreement beyond the marginal-label expectation.

- No paired labels: agreement and kappa are unavailable; `kappaStatus` is
  `no-pairs`.
- Both annotators use only the same single label: raw agreement is 100%, but
  kappa is unavailable because its denominator is zero; status is `degenerate`.
- Otherwise kappa is defined, from -1 to 1; status is `defined`.

The API uses `undefined` for unavailable numbers, so JSON omits those numeric
fields and retains the status and counts. It never substitutes zero or one.
Label counts include each annotator's totals, matching labels and the match
rate within each human-labelled class. A class with no human labels has an
unknown within-class match rate.

Kappa is not an accuracy score or a confidence interval. Sample counts do not
prove independent observations, representative coverage or reliable human
annotations. Inspect the raw agreement, class balance, sample size and actual
disagreements together.

## Breakdowns and portable output

`analyzeRun(report).calibration` and `summarizeCalibration(report.rows)` expose
the same metrics used in JSON summaries, text, Markdown and offline HTML.
The public types are `CalibrationAgreement` and `CalibrationSummary`.

Category groups use `groundTruthCategory`. Missing category/model metadata
stays unknown. The failure taxonomy in `row.category` is not interpreted as
an outcome label scale. Multi-class judge/human verdicts remain a separate
roadmap item. Each group's kappa uses that group's own label frequencies;
small or single-class groups can therefore have unavailable kappa.

Human-readable breakdowns show at most 20 groups per dimension and disclose
that limit. JSON retains every group. HTML escapes the category, suite and
model labels.

Try the synthetic two-label example from the repository root:

```sh
pnpm dev report --input=examples/calibration-minimum-sample --report-dir=./calibration-report --reporter=html --reporter=json-summary
```

Its two labels agree and include both classes, so agreement and kappa are one.
That tiny example demonstrates the calculation, not production reliability.

![Offline calibration statistics for the two-label synthetic example](./images/calibration-statistics.png)
Regenerate this image with `pnpm assets:regenerate`.

## Optional blocking threshold

Add `minJudgeKappa` to a suite's `gate.thresholds` only when you want it enforced:

```json
{ "minJudgeAgreementRate": 0.9, "minCalibrationRows": 20, "minJudgeKappa": 0.6 }
```

These are illustrative policy values, not recommended defaults. The kappa bar
must be finite and between -1 and 1. `min_judge_kappa` and `min-judge-kappa`
are aliases. A blocking bar fails when kappa is unavailable or below the bar.
Without the bar, reporting kappa does not change the gate result. Report-only
manifest thresholds retain their normal non-blocking behavior.

A declared kappa bar can also qualify calibration preflight evidence, but it
must pass on the matching judge's own rows. Missing or degenerate evidence
cannot qualify, and other judges cannot improve that judge's kappa. Existing
recency, independent-run, rubric and explicit opt-out rules still apply.
