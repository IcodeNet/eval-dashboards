# Inspect AI

Use this when your team already runs [Inspect](https://inspect.aisi.org.uk/) evals and wants to gate and trend those results with `eval-dashboards` in the same flow as other runners.

## Why this path

- Keep Inspect as the execution harness.
- Convert Inspect log JSON into `eval-report/v1`.
- Reuse one CI gate/report/history flow across mixed eval stacks.

## Import command

```sh
eval-dashboards import --from=inspect-ai --input=./inspect-log.json --out=.evals_output/inspect-ai.json
```

`inspect` is accepted as a short alias for `inspect-ai`.

## Input shape

The adapter accepts:

- one log object with `samples[]` (for example from `inspect log dump <log.eval>`), or
- an array of such log objects.

Inspect defaults to `.eval` binary logs, so export JSON first with `inspect log dump` when needed.

## Mapping notes

- `suite` from `eval.task` (fallback: `eval.task_display_name`, `eval.task_id`, `eval.task_file`, then CLI `--suite`).
- row id from `sample.id`/`sample.sample_id`.
- `question` from `sample.description` (fallback: `eval.description`).
- pass/fail from sample signals:
  - `sample.error` present -> fail
  - boolean score value false -> fail
  - otherwise numeric/boolean score values (threshold `>= 0.5`)
- `metadata.inspectEvalId` keeps `eval.eval_id` when present.

## Current limitations

- The importer currently reads JSON logs, not native `.eval` binaries.
- Rich transcript fields (`events`, `messages`, tool traces) are not flattened into row-level evidence by default.

## Source

- Inspect release `0.3.278` notes: tasks and samples now carry `description` in eval logs (`evals_df()` / `samples_df()`).
  - https://github.com/UKGovernmentBEIS/inspect_ai/releases/tag/0.3.278
- Inspect log format docs (`.eval` default and JSON dump path):
  - https://inspect.aisi.org.uk/eval-logs.html
