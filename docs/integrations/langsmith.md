# LangSmith

Use this when you already have LangSmith run data (for example, `query_runs` / `fetch_runs` output) and want CI-native gating and static dashboards without moving execution to a new platform.

## Why this path

- Keep LangSmith as the runner/trace system.
- Convert run evidence into `eval-report/v1`.
- Reuse one gate/report/history flow across mixed runners.

## Import command

```sh
eval-dashboards import --from=langsmith --input=./langsmith-runs.json --out=.evals_output/langsmith.json
```

The adapter accepts:

- JSON array of runs, or object with `runs[]`, `data[]`, or `results[]`
- pass/fail evidence from any of:
  - `pass` / `passed` / `success` booleans
  - `status` (`error|failed|failure` => fail; `success|succeeded|completed|ok` => pass only when no boolean verdict, feedback verdict, or numeric score is available)
  - `error` present => fail
  - numeric `score` or feedback/feedback-stats numeric score (>= 0.5 => pass)

## Mapping notes

- `suite` from `session_name` or `project_name` (fallback: `--suite` / default)
- `input` from `inputs` (or `input`)
- `output` from `outputs` (or `output`)
- `expected` from `reference_output` (or `expected`)
- `category` from `metadata.category` or first feedback key
- `durationMs` from `latency_ms` / `latencyMs`
- `metadata.provenance.sourceRef = "langsmith"`

## Verification loop

```sh
eval-dashboards lint --input=.evals_output

eval-dashboards check --input=.evals_output --min-pass-rate=0.8 --zero-critical

eval-dashboards report --input=.evals_output --report-dir=eval-report
```

## Risk register gate

Before adopting this path for production CI, run through:

- [Integration risk register](./risk-register.md)
