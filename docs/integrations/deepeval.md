# Works with DeepEval

## What DeepEval does well

- Python-native evaluator ecosystem for LLM quality checks.
- Broad evaluator set for correctness, relevance, safety, and custom metrics.
- Natural fit for teams already in pytest/Python pipelines.

## Tradeoffs

- Output schemas vary across versions and custom evaluators.
- Python dependency footprint can diverge from Node-only CI environments.

## Minimal conversion path into `eval-report/v1`

Use the built-in import adapter.

- Required: DeepEval JSON export (`test_results` or `results`).
- Output: normalized `eval-report/v1` rows with suite/pass metadata.

## Concrete command/pattern

```sh
eval-dashboards import --from=deepeval --input=./deepeval-results.json --out=.evals_output/import-deepeval.json
eval-dashboards lint --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
