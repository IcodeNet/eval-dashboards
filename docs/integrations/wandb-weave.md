# Works with W&B Weave

## What Weave does well

- Experiment tracking, dataset lineage, and model/eval traceability.
- Useful for teams already using W&B for ML operations.

## Tradeoffs

- Weave objects are rich and nested; dashboard/gate workflows need flattened row-level outputs.
- Version mismatch between tracked objects and deployed eval runner can create drift.

## Minimal conversion path into `eval-report/v1`

Export Weave evaluation rows, map to `rows[]`, and set suite metadata.

- Keep dataset/rubric versions explicit in suite manifests.
- Carry any provider-specific metadata under `rows[].metadata`.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=weave --input=./weave-export.json --out=./.evals_output/weave-import.json
eval-dashboards lint --input=.evals_output
eval-dashboards check --input=.evals_output
```

Related risks: [integration risk register](./risk-register.md)
