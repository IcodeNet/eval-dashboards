# Import adapter fixtures

Each file is a small sample of what another tool exports. The import adapter tests read them to check that `eval-dashboards import --from=<tool>` maps the fields correctly.

## Where they come from

These samples are hand-written to match each tool's export shape. They are not captured from a live run of the tool. The ids (`bt-1`, `ls-run-1`, `phoenix-1`) and the `otel-genai-fixture` scope name are made up.

| File | Adapter (`--from=`) | Shape it imitates |
| --- | --- | --- |
| `braintrust-sample.json` | `braintrust` | `results[]` with `scores` |
| `eval-ai-library-sample.json` | `eval-ai-library` | `results[]` with `actual_output`, `expected_output`, `retrieval_context` |
| `langfuse-sample.json` | `langfuse` | `data[]` of score objects with a nested `trace` |
| `langfuse-provenance-sample.json` | `langfuse` | `data[]` scores with optional `score_metadata` and `score_provenance` groups |
| `langsmith-sample.json` | `langsmith` | `runs[]` with `inputs`, `outputs`, `session_name` |
| `openai-evals-sample.jsonl` | `openai-evals` | JSON lines: a `spec` line, event lines for one `run_id`, then a `final_report` line |
| `otel-genai-sample.json` | `otel-genai` | OTLP JSON `resourceSpans` with GenAI evaluation events |
| `phoenix-sample.json` | `phoenix` | `results[]` with `question`, `output`, `reference_output` |
| `ragas-sample.json` | `ragas` | `scores[]` with per-metric numbers |

No vendor version is recorded for any file, because none was captured. If a vendor changes its export, the adapter can break without these tests noticing.

## Changing a fixture

- When a vendor changes its export format, update the fixture first, then change the adapter until the tests pass.
- When you capture a real export, replace the sample, remove any customer text, and record the tool name, version and date in the table above.
- Keep each file small. A fixture should show one case per field the adapter reads.
