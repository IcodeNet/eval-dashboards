# Works with Promptfoo

Promptfoo is strong at prompt test authoring, assertions, and provider-level eval execution. `@icodenet/eval-dashboards` complements that by standardizing the output artifact (`eval-report/v1`) so you can run the same reporting, gating, and trend workflow used by other runners.

## Minimal import path

```sh
eval-dashboards import --from=promptfoo --input=./promptfoo-results.json --out=.evals_output/import-promptfoo.json
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

## Mapping to `eval-report/v1`

The Promptfoo importer accepts either a top-level array or an object with `results[]`.

| Promptfoo field(s) | `eval-report/v1` row field | Notes |
|---|---|---|
| `id`, `testCase.id`, row index | `id` | Falls back to `index <n>` when IDs are missing in source. |
| `testCase.metadata.suite`, `metadata.suite`, `--suite` | `suite` | `--suite` is used as fallback (`promptfoo-import` by default). |
| `pass`, `passed`, `success`, `gradingResult.pass`, `gradingResult.verdict` | `passed` | Import fails if signals conflict or no pass/fail signal exists. |
| `description` | `name`, `question` | Same source value mapped to both fields. |
| `vars`, `testCase.vars`, `prompt` | `input` | Non-strings are JSON-stringified. |
| `output`, `response.output`, `response.text` | `output` | First available value is used. |
| `expected`, `testCase.assert[0].value` | `expected` | Non-strings are JSON-stringified. |
| `score`, `gradingResult.score` | `score` | Optional numeric score. |
| `testCase.metadata.severity`, `metadata.severity` | `severity` | Defaults to `none` in final artifact when absent. |
| `testCase.metadata.category`, `metadata.category` | `category` | Optional free-form category string. |
| `gradingResult.reason` | `reason` | Optional explanation for pass/fail. |
| _(importer constant)_ | `kind` | Set to `deterministic` by importer today. |
| _(importer constant)_ | `metadata.provenance`, `metadata.lifecycle` | Adds import provenance and active lifecycle marker. |

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

- The importer targets common Promptfoo JSON shapes; custom nested layouts still need a pre-transform step.
- Only fields listed above are mapped into first-class row fields.
- `kind` is currently set to `deterministic` for imported rows.
- Trace links, provider request IDs, and token usage are not normalized into first-class schema fields yet; keep them under `row.metadata` if needed.

## Migration path

1. Start with CLI import for immediate compatibility.
2. Add stable row IDs and explicit suite names in Promptfoo outputs for better baseline diffs.
3. Add taxonomy-rich fields during or after import (for example `kind`, `datasetId`, `scenarioId`, `rubricId`, `promptVersion`, `agentVersion`) via your runner or a post-process step.
4. Move to direct `eval-report/v1` emission when you want full schema control without conversion.
