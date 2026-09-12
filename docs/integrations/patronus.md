# Works with Patronus

## What Patronus does well

- Focused evaluation around safety, policy, and compliance checks.
- Useful for governance-heavy deployments where policy evidence matters.

## Tradeoffs

- Policy taxonomies can be platform-specific and need explicit crosswalk mapping.
- Safety-only signals should be paired with quality/product metrics for release decisions.

## Minimal conversion path into `eval-report/v1`

Export policy verdicts and map each case into row-level outcome + severity.

- Preserve policy labels in `category` and/or `metadata`.
- Use suite manifests with `riskArea` and `gate.mode` for governance context.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=patronus --input=./patronus-export.json --out=./.evals_output/patronus-import.json
eval-dashboards check --input=.evals_output --zero-critical
```

Related risks: [integration risk register](./risk-register.md)
