# Works with Trace and Observability Stacks

Trace stacks (for example OpenTelemetry-native pipelines, Langfuse-style tracing, LangSmith-style traces, and APM backends) are strong at request-level visibility, latency, and debugging. `@icodenet/eval-dashboards` complements them by turning eval verdicts into a stable `eval-report/v1` artifact for repeatable quality gates and trend reporting.

## Minimal import path

`eval-dashboards` does not yet ship a dedicated `--from=trace` adapter. Use one of these practical paths:

1. **If your trace pipeline can export AgentEvals/OpenEvals-like rows**, import with the existing adapter:

```sh
eval-dashboards import --from=openevals --input=./trace-eval-rows.json --out=.evals_output/import-trace.json
```

2. **If your pipeline already emits `eval-report/v1`**, skip import and run checks/reports directly:

```sh
eval-dashboards lint --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

## Mapping to `eval-report/v1`

Use this mapping when designing a trace-to-eval export step.

| Trace / observability concept | `eval-report/v1` field | Notes |
|---|---|---|
| Evaluation case ID or span-linked case key | `id` | Keep stable across runs for better baseline diffs. |
| Eval suite or metric family | `suite` | Use explicit suite IDs (`groundedness`, `tool-routing`, etc.). |
| Binary verdict from scorer/judge | `passed` | Required for gate math. |
| Verdict confidence or metric score | `score` | Optional numeric signal. |
| Failure class / reason code | `category`, `reason` | Use `category` for machine grouping, `reason` for human-readable context. |
| Severity policy from alerting rules | `severity` | Map to `none/low/medium/high/critical`. |
| Agent transcript and tool events | `turns`, `toolCalls` | Recommended for agent-focused suites. |
| Judge identity/verdict/explanation | `judgeModel`, `judgeVerdict`, `judgeReasoning`, `axisScores` | Recommended for LLM-judge suites. |
| Dataset/scenario/rubric references | `datasetId`, `scenarioId`, `rubricId`, `rubricVariant` | Improves comparability and governance. |
| Trace URL, span ID, request ID | `trace.traceUrl`, `trace.spanId`, `trace.traceId` | Portable trace fields are optional and additive. Keep vendor-specific extras in `metadata`. |

## Expected output artifact shape

After import, output is an `eval-report/v1` JSON file with this top-level structure:

```json
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "import-...", "generatedAt": "..." },
  "suites": [{ "id": "...", "total": 1, "passed": 1, "failed": 0, "passRate": 1 }],
  "rows": [{ "id": "...", "suite": "...", "passed": true, "kind": "deterministic" }]
}
```

## Known limitations

- No dedicated trace-stack import source exists yet in `eval-dashboards import`.
- Trace reference fields are optional (`rows[].trace.traceId`, `rows[].trace.spanId`, `rows[].trace.traceUrl`, `rows[].trace.spanUrl`); exporters should set whichever fields they can reliably provide.
- Cross-vendor trace semantics vary; keep your exporter explicit about field mapping and versions.

## Migration path

1. Start by exporting minimal rows (`id`, `suite`, `passed`) from trace data.
2. Add severity/category/reason and stable dataset/scenario identifiers.
3. Add agent and judge evidence fields for taxonomy-complete reporting.
4. Write portable links/IDs into `rows[].trace.*`; keep stack-specific diagnostics in `rows[].metadata`.
