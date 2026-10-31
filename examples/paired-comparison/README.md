# Paired comparison example

This writes two synthetic reports with the same 100 passing cases. It shows the
difference between observed passing results and evidence for a statistical
comparison policy. It does not run a model or benchmark one.

From the repository root:

```sh
node examples/paired-comparison/generate.mjs
pnpm dev check --input=examples/paired-comparison/.evals_output --paired-min-delta=0 --paired-min-clusters=20 --assume-independent-clusters --json-out=.tmp/paired-check.json
```

The check intentionally exits **1** with `gateDecision.status` set to
`inconclusive`: the bound covers both a decrease and an increase. This is not a
claim that a case failed. The declared independence is part of this synthetic
demo's design; real datasets need an appropriate grouping/sampling design.

Generate an offline report with the same policy:

```sh
pnpm dev report --input=examples/paired-comparison/.evals_output --paired-min-delta=0 --paired-min-clusters=20 --assume-independent-clusters --reporter=html --reporter=json-summary --report-dir=.tmp/paired-report
```

Report generation exits **0**. Open `.tmp/paired-report/index.html`, or inspect
`gateDecision.uncertainty` and `analytics.pairedComparison` in `summary.json`.
A policy with an allowed negative margin may pass when the bound supports that
margin. Use ordinary point gates when the intended policy is about the observed
finite dataset alone. Population coverage and trial-level uncertainty are not
inferred by this example.
