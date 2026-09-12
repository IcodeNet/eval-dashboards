# Works with OpenEvals / AgentEvals

OpenEvals and AgentEvals are strong at agent-style evaluation workflows. `@icodenet/eval-dashboards` complements them with a shared artifact contract (`eval-report/v1`) and a consistent CLI for linting, gates, history, and static reports.

## Minimal import path

Both commands below use the same importer. `openevals` is an alias of `agentevals`.

```sh
eval-dashboards import --from=agentevals --input=./agentevals-results.json --out=.evals_output/import-agentevals.json
# equivalent alias:
eval-dashboards import --from=openevals --input=./openevals-results.json --out=.evals_output/import-openevals.json
```

## Mapping to `eval-report/v1`

The importer accepts either a top-level array, `rows[]`, or `results[]`.

| OpenEvals / AgentEvals field(s) | `eval-report/v1` row field | Notes |
|---|---|---|
| `id`, generated `<suite>-<index>` | `id` | Falls back to generated ID when missing. |
| `suite`, `metadata.suite`, `--suite` | `suite` | `--suite` fallback defaults to `agentevals-import`. |
| `pass`, `passed`, `success`, `verdict` | `passed` | Import fails on conflicts or missing pass/fail signals. |
| `name` | `name` | Optional row label. |
| `question` | `question` | Optional prompt/test question field. |
| `input` | `input` | Non-strings are JSON-stringified. |
| `output` | `output` | Non-strings are JSON-stringified. |
| `expected` | `expected` | Non-strings are JSON-stringified. |
| `score` | `score` | Optional numeric score. |
| `severity`, `metadata.severity` | `severity` | Defaults to `none` in final artifact when absent. |
| `category`, `metadata.category` | `category` | Optional free-form category string. |
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

- Import covers shared row semantics, not every framework-specific object shape.
- Agent conversation details (`turns`, `toolCalls`) are not inferred by the current importer.
- `kind` is currently `deterministic` for imported rows.

## Migration path

1. Start with the importer for immediate interoperability.
2. If your runner already has turn/tool evidence, append it in a post-process step or emit direct `eval-report/v1` rows.
3. Upgrade rows toward taxonomy completeness (`kind: "agent"`, `turns`, `toolCalls`, `promptVersion`, `agentVersion`, `agentChannel`).
4. Keep using OpenEvals/AgentEvals for execution while standardizing reporting and gates on `eval-report/v1`.
