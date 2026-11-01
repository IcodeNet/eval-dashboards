# Repeated trials: measured rate and uncertainty

This example uses the repository source; it does not publish a package. From the repository root:

```sh
node examples/repeated-trials/generate.mjs
pnpm dev report --input=examples/repeated-trials/.evals_output --reporter=html --reporter=json-summary --reporter=markdown-summary --report-dir=.tmp/repeated-trial-report
```

Open `.tmp/repeated-trial-report/index.html` and expand **Comparison evidence and
measured coverage**, or read `summary.json.analytics.repeatedTrials`.

Both synthetic cases have 95/100 passing trials in the current run and 80/100
in the baseline. Both aggregate booleans are true under majority aggregation.
The `declared` case has a fixed independent sampling declaration: its observed
rate is 0.95 and its 95% within-case interval is approximately [0.814, 1]. The
observed change is 0.15, with a conservative interval approximately
[-0.146, 0.348]. The interval includes zero; these counts do not establish an
improvement. The `unknown` case has the same observed rates but no interval,
because its sampling design is unspecified.

Only declare `fixed-independent` when the trial count was set in advance and
trials are independent under stable case and grading conditions. Adaptive
stopping and dependent retries do not satisfy that declaration. These per-case
intervals do not correct for selecting cases or repeatedly checking results.
They do not change release gates or count trials as independent dataset cases.

No model, provider, database, or paid service is required. These counts are
fixtures, not measured model performance. The existing runner remains yours.

The reproducible [report screenshot](../../docs/images/repeated-trials.png) shows
the declared interval alongside the case whose sampling design is unknown.
