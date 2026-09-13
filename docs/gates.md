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
- `minJudgeAgreementRate`
- `maxJudgeDisagreementRate`
- `maxAxisScoreDelta`
- `maxWarnings`
- `maxWarningsByCode`
- `failOnWarningCodes`
- `requiredPassingSuites`
- `newFailureKey`
- `statistical.mode` (`off` or `bootstrap`)
- `statistical.confidenceLevel`
- `statistical.bootstrapSamples`
- `statistical.minPassRateDelta`

Example:

```sh
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
```

Machine-readable CI output:

```sh
eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --json-out=eval-report/check-result.json
eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --heartbeat-out=eval-report/check-heartbeat.json
eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --junit-out=eval-report/check-result.junit.xml
eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --sarif-out=eval-report/check-result.sarif.json
eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --github-annotations-out=eval-report/check-annotations.json
```

`check-result.json` includes `newlyFailingRows[]` with URL-safe `reportAnchor` values (`#row-<encodeURIComponent(suite:id)>`) so CI annotations can deep-link directly to row evidence in the generated HTML report.

`check-heartbeat.json` includes machine-readable run status (`ran`, `skipped`, or `errored`) so CI can alert when gate execution did not run cleanly.

Heartbeat payload contract (`eval-check-heartbeat/v1`):

- `schemaVersion`: `"eval-check-heartbeat/v1"`
- `gateRunStatus`: `"ran" | "skipped" | "errored"`
- `generatedAt`: ISO timestamp for when heartbeat was written
- `exitCode`: check command exit code
- `runId` (optional): run id when available
- `baselineRunId` (optional): selected baseline run id when available
- `message` (optional): failure message for skipped/errored runs

- `--junit-out` emits JUnit XML for test-report ingestion in CI systems.
- `--sarif-out` emits SARIF 2.1.0 JSON with stable report-file locations plus row-anchor metadata (`properties.reportAnchor`).
- `--github-annotations-out` emits a simple annotations JSON payload (`level`, `title`, `message`) that workflow helpers can translate into GitHub log annotations.
- `--heartbeat-out` emits gate-run heartbeat JSON (`eval-check-heartbeat/v1`) with `gateRunStatus`, `exitCode`, and optional error message.

CI heartbeat guard example:

```sh
rm -f eval-report/check-heartbeat.json eval-report/check-result.json

# run check ... --heartbeat-out=eval-report/check-heartbeat.json --json-out=eval-report/check-result.json

if [ ! -f eval-report/check-heartbeat.json ]; then
  echo "Eval check heartbeat output missing"
  exit 1
fi

status=$(jq -r '.gateRunStatus' eval-report/check-heartbeat.json)
exit_code=$(jq -r '.exitCode' eval-report/check-heartbeat.json)

if [ "$status" != "ran" ]; then
  echo "Eval check did not run cleanly (status=$status)"
  exit 1
fi

if [ "$exit_code" != "0" ] && [ "$exit_code" != "1" ]; then
  echo "Eval check errored (exitCode=$exit_code)"
  exit 1
fi

if [ "$exit_code" = "1" ]; then
  echo "Eval gates failed"
  exit 1
fi

if [ ! -f eval-report/check-result.json ]; then
  echo "Eval check result output missing"
  exit 1
fi
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

Statistical gate options (opt-in):

- `--statistical-mode=off|bootstrap`: enable confidence-aware pass-rate delta gating (default `off`).
- `--confidence-level=<0..1>`: confidence interval level for bootstrap mode (default `0.95`).
- `--bootstrap-samples=<n>`: number of bootstrap resamples (integer, minimum `200`, default `2000`).
- `--min-pass-rate-delta=<n>`: minimum acceptable pass-rate delta vs baseline. The gate fails only when the bootstrap confidence interval is fully below this threshold (upper bound `< n`).

Current assumption: bootstrap draws are unpaired across all rows in each run (not scenario-paired resampling), and row counts must match between current and baseline runs. Use this as a conservative run-le...[truncated]

Typical workflow policies:

```sh
# Pull request policy: compare against previous run, tolerate blocked baseline compatibility while suites evolve.
eval-dashboards check --input=.evals_output --baseline-strategy=rolling --allow-blocked-baseline --max-new-failures=0 --zero-critical

# Main policy: compare against strongest recent same-mode run.
eval-dashboards check --input=.evals_output --baseline-strategy=champion --baseline-lookback=20 --max-new-failures=0 --zero-critical

# Strict live policy: require preflight pass and bound warning risk.
eval-dashboards check --input=.evals_output --require-suite-pass=preflight --new-failure-key=scenario-category --max-new-failures=0 --max-warnings=5 --max-warning-code=missing-kind:0 --fail-on-warning-code=missing-judge-model --zero-critical

# Statistical policy: require confidence that pass-rate delta is not regressing vs baseline.
eval-dashboards check --input=.evals_output --baseline-strategy=rolling --statistical-mode=bootstrap --confidence-level=0.95 --bootstrap-samples=2000 --min-pass-rate-delta=0
```

Fast preflight lint before expensive eval stages:

```sh
eval-dashboards lint --input=.evals_output
```

Use `--strict` to fail on warnings as well as errors:

```sh
eval-dashboards lint --input=.evals_output --strict
```

Guardrail triage report (for attack-style suites using existing safety taxonomy categories):

```sh
eval-dashboards report --input=.evals_output --reporter=html --profile=guardrail --report-dir=eval-report
```

The guardrail profile adds focused breakdowns for failing rows by category, severity, and failure pattern grouping.

Exit codes:

- `0`: pass.
- `1`: gates failed.
- `2`: invalid config or artifact.
- `3`: no usable reports found.