# Works with DeepEval

DeepEval is strong at LLM-oriented metrics and evaluator workflows. `@icodenet/eval-dashboards` complements it by converting DeepEval outputs into a portable `eval-report/v1` artifact used for shared reporting, gates, and cross-run history.

## Minimal import path

```sh
eval-dashboards import --from=deepeval --input=./deepeval-results.json --out=.evals_output/import-deepeval.json
eval-dashboards check --input=.evals_output --allow-blocked-baseline
```

## Mapping to `eval-report/v1`

The DeepEval importer accepts either a top-level array, `test_results[]`, or `results[]`.

| DeepEval field(s) | `eval-report/v1` row field | Notes |
|---|---|---|
| `id`, `name`, row index | `id` | Falls back to `<suite>-<index>` when `id` is missing. |
| `metadata.suite`, `--suite` | `suite` | `--suite` fallback defaults to `deepeval-import`. |
| `pass`, `passed`, `success`, `verdict` | `passed` | Import fails on conflicts or when no signal exists. |
| `name` | `name` | Optional row label. |
| `question`, `name` | `question` | Uses `question` first, then `name`. |
| `input`, `question` | `input` | Non-strings are JSON-stringified. |
| `actual_output`, `output` | `output` | Uses first available output field. |
| `expected_output`, `expected` | `expected` | Non-strings are JSON-stringified. |
| `score` | `score` | Optional numeric score. |
| `metadata.severity` | `severity` | Defaults to `none` in final artifact when absent. |
| `metadata.category` | `category` | Optional free-form category string. |
| `reason` | `reason` | Optional explanation. |
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

- DeepEval-specific metric details are not fully normalized into first-class fields; preserve extra metric detail in `metadata` if you need it downstream.
- `kind` is currently `deterministic` for imported rows, even when source checks were LLM-judge-based.
- Import expects one of the supported container shapes (`[]`, `test_results[]`, `results[]`).

## Migration path

1. Use CLI import to adopt reporting/checking quickly.
2. Keep suite names and row IDs stable in your DeepEval export path for better trend comparability.
3. Gradually enrich rows with taxonomy fields (`kind`, `judgeModel`, `judgeVerdict`, `axisScores`, `datasetId`, `rubricId`) in a post-process step.
4. For full fidelity, emit `eval-report/v1` directly from your DeepEval runner wrapper.
