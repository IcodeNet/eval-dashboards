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
- Preserve optional score-evidence exports when present:
  - `score_metadata` / `scoreMetadata` -> `rows[].metadata.langfuseScoreMetadata`, falling back to the score's `metadata` object (the column emitted by scheduled blob exports).
  - `score_provenance` / `scoreProvenance` and flattened provenance columns (`author_user_id`, `config_id`, `queue_id`, `evaluator_id`, `evaluation_rule_id`, `execution_trace_id`) -> `rows[].metadata.langfuseScoreProvenance`

## Concrete command/pattern

```sh
eval-dashboards import --from=langfuse --input=./langfuse-export.json --out=./.evals_output/langfuse-import.json
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

When both field spellings are present, the snake_case object takes precedence. Flattened string provenance columns (including empty strings) override matching nested keys; non-string flattened values are ignored; other nested keys are retained. Missing or non-object optional groups are ignored. The imported score evidence stays separate from the importer's own `metadata.provenance` record.

Langfuse's optional `score_metadata` and `score_provenance` export groups must be enabled to include these columns in future scheduled exports; see the [Langfuse export announcement](https://langfuse.com/changelog/2026-10-22-blob-storage-score-field-groups). The importer consumes JSON score objects; convert CSV/Parquet exports to JSON first.

Related risks: [integration risk register](./risk-register.md)
