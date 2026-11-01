# Works with Arize Phoenix

## What Phoenix does well

- Strong LLM observability and evaluation workflows with trace context.
- Good fit for root-cause analysis on retrieval and tool-use failures.

## Tradeoffs

- Observability exports often include fields not directly usable as gate metrics.
- Export schemas vary by evaluator type, so import rules must stay explicit.

## Minimal conversion path into `eval-report/v1`

Use the built-in adapter:

- Source: `--from=phoenix`
- Accepted input shapes: JSON array, or objects with `results[]`, `rows[]`, or `evaluations[]`
- Pass/fail mapping: label (`correct`/`incorrect` etc.) first, then `score >= 0.5`

Preserved evidence:

- `traceId`/`trace_id` and `spanId`/`span_id` map into `rows[].trace`. Null IDs are omitted; a valid alias or trace URL is still preserved.
- `traceUrl`/`trace_url` and `spanUrl`/`span_url` map into `rows[].trace` when present.
- Decision-model metadata fields from Phoenix exports map into row metadata:
  - `metadata.confidence` → `rows[].metadata.phoenixDecisionConfidence`
  - `metadata.probabilities` → `rows[].metadata.phoenixDecisionProbabilities`

## Concrete command/pattern

```sh
eval-dashboards import --from=phoenix --input=./phoenix-export.json --out=.evals_output/import-phoenix.json
eval-dashboards check --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
