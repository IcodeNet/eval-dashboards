# Works with Promptfoo

## What Promptfoo does well

- Fast prompt and policy regression loops.
- Good matrix testing across prompts, models, and variables.
- Established workflow for red-team and guardrail assertions.

## Tradeoffs

- Output JSON shape can vary by plugin/version.
- Promptfoo focuses on test execution; cross-run governance and publish workflows are separate concerns.

## Minimal conversion path into `eval-report/v1`

Use the built-in import adapter.

- Required: promptfoo JSON export.
- Output: one `eval-report/v1` artifact under `.evals_output/`.

## Concrete command/pattern

```sh
eval-dashboards import --from=promptfoo --input=./promptfoo-results.json --out=.evals_output/import-promptfoo.json
eval-dashboards check --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```


The importer preserves key Promptfoo evidence fields when present:
- `gradingResult.reason` / `gradingResult.comment` -> `rows[].reason`
- `latencyMs` (or `response.latencyMs`) -> `rows[].durationMs`
- `metadata.sessionId` -> `rows[].metadata.sourceSessionId`
- provider/eval error rows (`error`, `response.error`, `providerResponse.error`, or `failureReason: 2`) -> imported as failed rows with the numeric `row.score` or `gradingResult.score` preserved, defaulting to `score: 0` only when neither is numeric; available error reasons are preserved

Related risks: [integration risk register](./risk-register.md)
