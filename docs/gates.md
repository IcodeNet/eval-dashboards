# Gates

Gates make eval quality enforceable in CI.

Initial gates:

- `minPassRate`
- `maxNewFailures`
- `zeroCritical`

Example:

```sh
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
```

Exit codes:

- `0`: pass.
- `1`: gates failed.
- `2`: invalid config or artifact.
- `3`: no usable reports found.