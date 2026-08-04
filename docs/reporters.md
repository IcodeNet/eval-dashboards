# Reporters

Built-in reporters:

- `text`: terminal summary.
- `json-summary`: machine-readable summary.
- `markdown-summary`: PR and build summary (includes latency p50/p95/avg/max when rows include `durationMs`).
- `html`: static dashboard (includes run-level latency cards when rows include `durationMs`).

Multiple reporters can be requested in one command:

```sh
eval-dashboards report --input=.evals_output --reporter=html --reporter=text
```

Compare any two runs directly in the report flow:

```sh
eval-dashboards report --input=.evals_output --run-id=run-2026-08-03 --baseline-run-id=run-2026-07-28 --reporter=html
```

- `--run-id`: chooses the current run to render.
- `--baseline-run-id`: chooses the comparison baseline run.