# Works with OpenAI Evals (sunset migration)

## What OpenAI Evals did well

- Fast iteration on grader-backed evals inside one platform.
- Useful baseline for teams already storing oaieval event logs.

## Current constraint

OpenAI has announced Evals platform deprecation and a shutdown timeline.
For teams with existing exports, migration paths need to keep CI gates running
without waiting for a full harness rewrite.

Source timeline: https://developers.openai.com/api/docs/guides/evals

## Minimal conversion path into `eval-report/v1`

Use the built-in OpenAI Evals adapter:

- Canonical source: `--from=openai-evals`
- Accepted aliases: `--from=oaievals`, `--from=oaieval`, `--from=openai-eval`
- Input shape: JSONL event log, JSON array, or `{ "events": [...] }` where sample result events
  include `type` in `sampling`, `match`, or `metrics` plus `data`.

Pass/fail mapping:

- `data.correct` (boolean) when present.
- Else `data.score >= 0.5` fallback.

## Concrete command/pattern

```sh
eval-dashboards import --from=oaievals --input=./openai-evals-results.jsonl --out=.evals_output/import-openai-evals.json
eval-dashboards check --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
```

## Known limitations

- The adapter normalizes open-source `oaieval` result event logs only; it does not re-run graders or directly import arbitrary hosted Evals API exports. Normalize other export formats into the documented event shape first.
- `score_model` and other unrecognized event types are ignored; an input with no recognized result events fails with exit code `2`.
- `spec` and `final_report` events supply context or aggregates, not result rows.
- If a result event has neither `data.correct` nor numeric `data.score`, import
  fails with exit code `2` so CI cannot silently pass ambiguous rows.

Related risks: [integration risk register](./risk-register.md)

## Replayable migration smoke check

From a checkout of this repository, import `test/fixtures/openai-evals-sample.jsonl`
with any accepted alias. It contains two scored rows, one passing and one failing.
A check with `--min-pass-rate=0.5` passes; a check with `--min-pass-rate=1` fails
with exit code `1`. Choose production thresholds from your policy rather than
copying the fixture threshold. Adapter coverage lives in
`test/import-adapters-openai-evals.test.ts`; completion coverage lives in
`test/completion.test.ts`.
