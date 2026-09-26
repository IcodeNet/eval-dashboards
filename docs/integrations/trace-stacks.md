# Works with trace and observability stacks

This page applies to trace systems such as OpenTelemetry backends, Langfuse, Phoenix, and internal trace stores.

For a documented, tested field mapping from the OpenTelemetry GenAI
semantic conventions' `gen_ai.evaluation.result` event to `EvalRow`, see
[OpenTelemetry GenAI evaluation events](./otel-genai.md).

## What trace stacks do well

- Explain why a row failed (tool latency, retrieval miss, policy branch, etc.).
- Provide replay/debug evidence beyond pass/fail summaries.

## Tradeoffs

- Trace stores are often cloud-coupled while report artifacts are offline-first.
- URL lifetimes and access controls can make links non-portable unless IDs are also preserved.

## Minimal conversion path into `eval-report/v1`

- Keep `rows[].trace.traceId` and `rows[].trace.spanId` as stable portable IDs.
- Add `traceUrl`/`spanUrl` when you have a durable deep link.
- Keep core gate fields (`passed`, `severity`, `category`, `reason`) independent of trace backend availability.

## Concrete command/pattern

```sh
eval-dashboards report --input=examples/basic-json --run-id=run-trace-links --reporter=html --report-dir=eval-report
```

Then open `eval-report/index.html` and inspect row `agent/tool-timeout-001`; the row details panel renders trace and span links.

Related:

- [OpenTelemetry GenAI evaluation events](./otel-genai.md)
- [Artifact format trace fields](../artifact-format.md)
- [Integration risk register](./risk-register.md)
