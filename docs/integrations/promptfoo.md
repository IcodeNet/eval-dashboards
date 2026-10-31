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

- Required: promptfoo JSON/JSONL export (`results[]` rows, `results.outputs[]` rows, or newline-delimited result rows).
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
- missing row ids -> deterministic `promptfoo-<sha1>` ids derived from suite + case payload (`#2` suffix for duplicates in one file), so row identity does not depend on array position
- provider/eval error rows (`error`, `response.error`, `providerResponse.error`, or `failureReason: 2`) -> imported as failed rows with the numeric `row.score` or `gradingResult.score` preserved, defaulting to `score: 0` only when neither is numeric; available error reasons are preserved
- `gradingResult.componentResults[]` assertion details -> `rows[].checks[]` (`type`, `pass`, optional `expected`, `actual`, `threshold`, `weight`) so per-assertion evidence survives import

Related risks: [integration risk register](./risk-register.md)

Generated base IDs are independent of array position. Duplicate suffixes depend on encounter order and can change in partial exports that omit earlier matching cases. Explicit IDs are preserved unchanged; generated IDs avoid all explicit IDs in the file, including suffixed IDs.

## Assertion evidence mapping

Check `type` is the runner-defined assertion type, trimmed without an enum. Missing or blank types use `promptfoo-assertion-<position>` based on the original one-based component position; these fallback labels are positional, not cross-export identities. Components without a boolean `pass` are skipped; absent or unusable lists omit `checks`.

The assertion's `value` becomes `expected`, including false, zero, null, and object values. A finite component `score` becomes `actual` (the assertion score, not model output); finite numeric assertion `threshold` and `weight` are retained, including zero. Other numeric-field shapes are omitted. Component reasoning has no check-level field in v1 and is not copied; the aggregate row reason stays available.

Checks are evidence only: the importer preserves the source row's aggregate pass/fail and does not recalculate it from checks. See [Promptfoo export documentation](https://www.promptfoo.dev/docs/configuration/outputs/).

Repository smoke example:

```sh
pnpm dev import --from=promptfoo --input=test/fixtures/promptfoo-checks-sample.json --out=/tmp/promptfoo-checks/report.json
pnpm dev report --input=/tmp/promptfoo-checks --reporter=html --report-dir=/tmp/promptfoo-checks-html
```
