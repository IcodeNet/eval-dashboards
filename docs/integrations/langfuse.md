# Works with Langfuse

## What Langfuse does well

- Trace-first observability for LLM/agent pipelines.
- Strong linking between prompts, traces, spans, and scores.

## Tradeoffs

- Trace data model is observability-first; eval gating usually needs additional normalization.
- Cloud-hosted traces can conflict with offline-first review requirements for some teams.

## Minimal conversion path into `eval-report/v1`

Export scored traces/spans, then map each evaluated item into a row.

- Preserve trace linkage in `rows[].trace` (`traceId`, `spanId`, `traceUrl`, `spanUrl`).
- Keep pass/fail and severity in row-level fields for gating.

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=langfuse --input=./langfuse-export.json --out=./.evals_output/langfuse-import.json
eval-dashboards report --input=.evals_output --run-id=langfuse-import --reporter=html --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
