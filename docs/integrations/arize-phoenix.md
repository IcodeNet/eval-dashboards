# Works with Arize Phoenix

## What Phoenix does well

- Strong LLM observability and evaluation workflows with trace context.
- Good fit for root-cause analysis on retrieval and tool-use failures.

## Tradeoffs

- Observability exports often include fields not directly usable as gate metrics.
- Python-sidecar assumptions are common in Phoenix-centric stacks.

## Minimal conversion path into `eval-report/v1`

Export eval rows from Phoenix and map each row to schema fields.

- Preserve `traceId`/`spanId` and links in `rows[].trace`.
- Normalize pass/fail signals before gate checks.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=phoenix --input=./phoenix-export.json --out=./.evals_output/phoenix-import.json
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
