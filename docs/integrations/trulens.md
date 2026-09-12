# Works with TruLens

## What TruLens does well

- Feedback-function style evaluation over app traces and responses.
- Useful for combining trace introspection with scoring feedback.

## Tradeoffs

- Feedback outputs are often continuous values; gate thresholds must be explicit.
- Trace payloads can be large and need trimming for portable artifacts.

## Minimal conversion path into `eval-report/v1`

Export evaluated records and map each feedback item into row evidence.

- Write normalized rows with stable `id`, `suite`, and `passed`.
- Store trace identifiers in `rows[].trace` and large payload refs in metadata.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=trulens --input=./trulens-export.json --out=./.evals_output/trulens-import.json
eval-dashboards lint --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
