# Works with Braintrust

## What Braintrust does well

- Production-style eval datasets and scoring workflows.
- Good support for continuous eval and annotation loops.

## Tradeoffs

- Project-specific score schemas can vary across teams.
- Platform-native fields need explicit mapping for portable cross-run diffs.

## Minimal conversion path into `eval-report/v1`

Export scored examples and map them to stable row ids and suites.

- Put Braintrust scorer outputs into `judge*` or `axisScores` where appropriate.
- Keep baseline-compatible ids stable across runs.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=braintrust --input=./braintrust-export.json --out=./.evals_output/braintrust-import.json
eval-dashboards check --input=.evals_output --allow-blocked-baseline
```

Related risks: [integration risk register](./risk-register.md)
