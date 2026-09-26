# Works with OpenTelemetry GenAI evaluation events

This page documents the mapping between the OpenTelemetry GenAI semantic
conventions' `gen_ai.evaluation.result` event and this repo's `EvalRow`
shape, plus the runnable adapter/example that implements it.

## Status of the upstream spec

The OpenTelemetry GenAI semantic conventions are **Development/unstable**
(confirmed as of the `gen_ai.evaluation.result` event landing in the GenAI
conventions v1.38.0 cut, Oct 2025). Treat the mapping below as **best-effort,
versioned guidance**, not a hard schema dependency — matching this repo's
own "additive, versioned" posture toward `eval-report/v1` (see
`docs/artifact-format.md`). Pin a specific semantic-conventions version in
your own pipeline and re-check this mapping when you bump it.

Since semantic-conventions v1.42.0 (June 2026) the GenAI conventions live in
their own repository, `open-telemetry/semantic-conventions-genai`. That
repository has no tagged release yet, so pin your instrumentation library
version and record which schema it targets.

Langfuse, Arize Phoenix, and Datadog LLM Observability are reported to
consume `gen_ai.evaluation.result` on the standard OTLP endpoint (source:
third-party survey linked from `docs/ROADMAP.md` 4J; check your vendor's docs).

## Accepted input

- One OTLP/JSON export object, or JSONL with one export per line (the OTel
  Collector file exporter format).
- Span-event encoding: `resourceSpans[].scopeSpans[].spans[].events[]` with
  `name: "gen_ai.evaluation.result"`.
- Log-record encoding: `resourceLogs[].scopeLogs[].logRecords[]` with
  `eventName: "gen_ai.evaluation.result"` (or the older `event.name`
  attribute), using the record's own `traceId`/`spanId`.

## Field mapping table

| OTel GenAI attribute / event field | `EvalRow` field | Notes |
|---|---|---|
| `gen_ai.evaluation.name` | `category`, `judgeCategory`, and the `id` suffix | The evaluator/metric name (e.g. `hallucination`, `relevance`). No enum lock-in on either side. |
| `gen_ai.evaluation.score.value` | `score` | Numeric score, copied as-is. OTLP/JSON `intValue` strings are parsed as numbers. |
| `gen_ai.evaluation.score.label` | `passed`, `judgeVerdict`, and a note in `reason` | Used to infer pass/fail (see below). The label is recorded in `reason`, e.g. `(score.label=pass)`. |
| `gen_ai.evaluation.explanation` | `judgeReasoning`, `reason` | Free-text rationale from the evaluator. |
| `error.type` | `passed: false`, `reason` | An evaluator error becomes a failed row (`evaluator error: <type>`) with `judgeVerdict` unset; it does not abort the import. |
| `traceId` | `trace.traceId` | Correlates the evaluation event back to the originating trace. |
| `spanId` | `trace.spanId`, and the `id` prefix | Correlates the evaluation event to the span it evaluated. |
| span `name` | `name` | For example `chat gpt-4`. Span-event encoding only. |

Every imported row gets `kind: "llm-judge"`.

### Row ids are not stable across runs

The row `id` is `<spanId>:<evaluation.name>`. A repeated id within one file
gets a `#2`, `#3` suffix. This makes ids unique within one export, but OTel
generates a new random `spanId` for every execution. So the same case gets a
different id in the next run, and a baseline comparison will show every
failure as "new" rather than "persistent".

For cross-run tracking, give each case a stable key yourself: build the
report with the runner adapter helpers (`src/adapters/runner.ts`) and set the
row `id` from your dataset case id. Events without a `spanId` get a
positional id. `gen_ai.response.id` (the spec's correlation fallback) is not
mapped yet.

### Pass/fail inference

`passed` is not part of the OTel event, so it is inferred in this order:

1. `error.type` present: `passed: false`.
2. `score.label` (case-insensitive): `pass`, `passed`, `correct`,
   `relevant`, `true` pass; `fail`, `failed`, `incorrect`, `not_relevant`,
   `irrelevant`, `false` fail.
3. Otherwise a numeric `score.value >= 0.5` passes. This assumes higher is
   better and a 0–1 scale, the same assumption the Ragas and Braintrust
   imports make. It is wrong for lower-is-better metrics (e.g. toxicity) and
   for other scales (the spec's own example is `4.0`). When this rule decides
   the verdict, `reason` says so, e.g. `score.value=0.1 < 0.5 threshold`.
4. None of the above: the import fails with exit code 2.

## Minimal conversion path into `eval-report/v1`

- Keep `trace.traceId`/`trace.spanId` as stable, portable IDs independent of
  any specific backend's URL scheme.
- Add `traceUrl`/`spanUrl` when you have a durable deep link into your trace
  backend (Langfuse, Phoenix, Datadog, or your own OTel collector UI).
- Keep core gate fields (`passed`, `severity`, `category`, `reason`)
  independent of whether OTel evaluation-event data is present.

## Concrete command/pattern

```sh
eval-dashboards import --from=otel-genai --input=test/fixtures/otel-genai-sample.json \
  --out=.evals_output/import-otel-genai.json --suite=otel-genai-import
```

Runnable, tested example: `test/fixtures/otel-genai-sample.json` is a
fixture OTLP/JSON-shaped span export containing a `gen_ai.evaluation.result`
event; `test/import-adapters-otel-genai.test.ts` asserts the resulting
`eval-report/v1` row has `category`, `judgeCategory`, `judgeVerdict`,
`score`, `judgeReasoning`, `reason` and `trace.traceId`/`trace.spanId`
populated and correct. The same test file covers JSONL collector exports,
log-record events, `error.type`, and duplicate ids. Taxonomy lint reports no
errors; expect a `missing-judge-model` warning, because the OTel event has no
judge-model attribute.

Related:

- [Trace/observability stacks](./trace-stacks.md)
- [Artifact format trace fields](../artifact-format.md)
- [Integration risk register](./risk-register.md)
