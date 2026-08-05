# Gates

Gates make eval quality enforceable in CI.

Initial gates:

- `minPassRate`
- `maxNewFailures`
- `zeroCritical`
- `maxCriticalFailures`
- `criticalFailureRate`

Example:

```sh
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
```

Baseline-aware options:

- `--baseline-run-id=<run-id>`: explicit baseline.
- `--baseline-strategy=rolling|champion`: choose baseline from discovered prior runs when `--baseline-run-id` is omitted.
- `--baseline-lookback=<n>`: restrict baseline candidates to the most recent `n` prior runs before strategy selection.

Typical workflow policies:

```sh
# Pull request policy: compare against previous run, tolerate blocked baseline compatibility while suites evolve.
eval-dashboards check --input=.evals_output --baseline-strategy=rolling --allow-blocked-baseline --max-new-failures=0 --zero-critical

# Main policy: compare against strongest recent same-mode run.
eval-dashboards check --input=.evals_output --baseline-strategy=champion --baseline-lookback=20 --max-new-failures=0 --zero-critical
```

Fast preflight lint before expensive eval stages:

```sh
eval-dashboards lint --input=.evals_output
```

Use `--strict` to fail on warnings as well as errors:

```sh
eval-dashboards lint --input=.evals_output --strict
```

Exit codes:

- `0`: pass.
- `1`: gates failed.
- `2`: invalid config or artifact.
- `3`: no usable reports found.