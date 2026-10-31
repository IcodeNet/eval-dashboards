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
  - otherwise every numeric/boolean score must clear `>= 0.5` (booleans map to 1/0); a true score never overrides another scorer's failure
  - `score` is the arithmetic mean, for display only; pass/fail uses every scorer, not the mean
  - no usable score or error -> invalid import (exit 2), with the row and suite named
- `metadata.inspectEvalId` keeps `eval.eval_id` when present.

## Current limitations

- The importer currently reads JSON logs, not native `.eval` binaries.
- Rich transcript fields (`events`, `messages`, tool traces) are not flattened into row-level evidence by default.
- Numeric scores are assumed to use a scale where `0.5` is the passing threshold. Normalize custom scales before import.
- Categorical scores such as `"C"` / `"I"` and structured score values are not interpreted. Normalize them to numeric/boolean scores first. Unsupported score values are ignored when usable scores are also present.

## Runnable fixture

From this repository:

```sh
pnpm dev import --from=inspect-ai --input=test/fixtures/inspect-ai-sample.json --out=/tmp/inspect-ai-artifacts/report.json
pnpm dev report --input=/tmp/inspect-ai-artifacts --reporter=html --report-dir=/tmp/inspect-ai-report
```

The synthetic fixture contains one pass, one mixed-score failure, and one runner error. It also demonstrates sample description and task description fallback. It is a compatibility example, not a captured vendor export.

Related risks: [integration risk register](./risk-register.md). Check source score scales and mappings before using imported results to block CI.

## Source

- Inspect release `0.3.278` notes: tasks and samples now carry `description` in eval logs (`evals_df()` / `samples_df()`).
  - https://github.com/UKGovernmentBEIS/inspect_ai/releases/tag/0.3.278
- Inspect log format docs (`.eval` default and JSON dump path):
  - https://inspect.aisi.org.uk/eval-logs.html
