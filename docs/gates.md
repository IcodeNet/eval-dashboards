# Gates

Gates make eval quality enforceable in CI.

## Why This Matters

- Preflight failures should block expensive stages early, before noisy live/judge failures hide root cause.
- Regressions should be counted once per logical failure, not multiplied by axis or mirrored rows.
- Warnings should be treated as explicit quality debt, not ignored until they become production incidents.
- Baseline compatibility should prevent misleading comparisons across dataset/rubric drift.

## What Changed

- Added warning gates: `maxWarnings`, `maxWarningsByCode`, `failOnWarningCodes`.
- Added canonical new-failure keying via `newFailureKey`.
- Added required suite-pass enforcement via `requiredPassingSuites`.
- Preserved baseline-aware controls (`baseline-run-id`, `baseline-strategy`, `baseline-lookback`, `allow-blocked-baseline`).

## How To Apply

- Add gate policy defaults in `eval-dashboards.config.ts`.
- Override policy per pipeline using `eval-dashboards check` flags.
- Prefer `require-suite-pass=preflight` for live workflows.
- Use `new-failure-key=scenario-category` when one scenario can emit multiple rows.
- Add warning budgets for the highest-risk warning codes first.

Initial gates:

- `minPassRate`
- `maxNewFailures`
- `zeroCritical`
- `maxCriticalFailures`
- `criticalFailureRate`
- `maxWarnings`
- `maxWarningsByCode`
- `failOnWarningCodes`
- `requiredPassingSuites`
- `newFailureKey`

Example:

```sh
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
```

Warning-aware gate options:

- `--max-warnings=<n>`: fail if taxonomy warnings exceed budget.
- `--max-warning-code=<code>:<n>` (repeatable): per-warning-code budgets.
- `--fail-on-warning-code=<code>` (repeatable): hard-fail selected warning classes.

Canonical new-failure keys:

- `--new-failure-key=row` (default): suite + row id.
- `--new-failure-key=scenario`: suite + scenario id.
- `--new-failure-key=scenario-category`: suite + scenario + category.
- `--new-failure-key=id-category`: suite + row id + category.

Preflight suite enforcement:

- `--require-suite-pass=<suite-id>` (repeatable): fail when a required suite has any failing rows.
- Typical usage: `--require-suite-pass=preflight` before live/judge gates.

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

# Strict live policy: require preflight pass and bound warning risk.
eval-dashboards check --input=.evals_output --require-suite-pass=preflight --new-failure-key=scenario-category --max-new-failures=0 --max-warnings=5 --max-warning-code=missing-kind:0 --fail-on-warning-code=missing-judge-model --zero-critical
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