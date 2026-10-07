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
- Input shape: JSON array or `{ "events": [...] }` where sample result events
  include `type` in `sampling`, `match`, `metrics`, or `score_model` plus `data`.

Pass/fail mapping:

- `data.correct` (boolean) when present.
- Else `data.score >= 0.5` fallback.

## Concrete command/pattern

```sh
eval-dashboards import --from=oaievals --input=./openai-evals-results.jsonl --out=.evals_output/import-openai-evals.json
eval-dashboards check --input=.evals_output --allow-blocked-baseline
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
```

## Known limitations

- The adapter normalizes oaieval result rows only; it does not re-run graders.
- If a result event has neither `data.correct` nor numeric `data.score`, import
  fails with exit code `2` so CI cannot silently pass ambiguous rows.

Related risks: [integration risk register](./risk-register.md)
