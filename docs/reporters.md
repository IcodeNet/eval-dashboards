# Reporters

Built-in reporters:

- `text`: terminal summary.
- `json-summary`: machine-readable summary.
- `markdown-summary`: PR and build summary (includes latency p50/p95/avg/max when rows include `durationMs`, plus cost/latency-quality frontier tables when row metrics are present).
- `html`: static dashboard (includes run-level latency cards when rows include `durationMs`, plus a cost/latency-quality frontier section when row metrics are present).

Reporter token notes:

- `markdown` is accepted as an alias for `markdown-summary`.
- Unknown reporter names fail fast with exit code `2`.

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