# Works with Ragas

## What Ragas does well

- Retrieval/RAG-specific metrics (faithfulness, relevance, context precision/recall).
- Natural fit for evaluation of retrieval pipelines.

## Tradeoffs

- Metric-heavy outputs need policy thresholds to become binary gate outcomes.
- RAG metric semantics can differ by dataset and prompt policy.

## Minimal conversion path into `eval-report/v1`

Export Ragas rows, map metric outputs into row scores and pass/fail decisions.

- Keep original metric values in `axisScores`.
- Apply explicit threshold policy while mapping to `passed`.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=ragas --input=./ragas-export.json --out=./.evals_output/ragas-import.json
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
