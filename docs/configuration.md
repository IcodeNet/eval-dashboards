# Configuration

Config locations:

- `eval-dashboards.config.ts`
- `eval-dashboards.config.js`
- `eval-dashboards` in `package.json`

Example:

```ts
export default {
  input: ['.evals_output/**/*.json'],
  reportDir: 'eval-report',
  reporters: ['html', 'json-summary', 'markdown-summary', 'text'],
  gates: {
    minPassRate: 0.9,
    maxNewFailures: 0,
    zeroCritical: true,
    newFailureKey: 'scenario-category',
    requiredPassingSuites: ['preflight'],
    maxWarnings: 5,
    maxWarningsByCode: {
      'missing-kind': 0,
    },
    failOnWarningCodes: ['missing-judge-model'],
    calibration: {
      enabled: true,
      suite: 'judge-calibration',
      maxAgeHours: 168,
      allowBlockingWithoutRecentMatch: false,
    },
  },
  baseline: {
    strategy: 'champion', // 'rolling' | 'champion'
    lookback: 30, // optional number of prior runs considered
  },
};
```

CLI overrides:

- `--baseline-run-id=<run-id>`: explicit baseline selection (highest priority).
- `--baseline-strategy=rolling|champion`: strategy when baseline run ID is omitted.
- `--baseline-lookback=<n>`: limit candidate prior runs considered by the strategy.

Recommended artifact layout:

- Write one file per run under `.evals_output` (for example `.evals_output/<runId>.json`).
- Preserve prior run files so `rolling` and `champion` strategies can select meaningful baselines and history commands can build trends.
- Use single-file overwrite workflows only when you do not need cross-run comparisons.

## Why

- Live eval failures are cheaper to diagnose when preflight and config context are standardized.
- New-failure gates are more trustworthy when they count logical regressions, not duplicate row variants.
- Warning budgets provide gradual tightening instead of all-or-nothing strict mode.

## What

- `gates.requiredPassingSuites`: enforce pass-only suites such as `preflight`.
- `gates.newFailureKey`: choose canonical failure keying (`row`, `scenario`, `scenario-category`, `id-category`).
- `gates.maxWarnings` and `gates.maxWarningsByCode`: cap warning volume globally and per code.
- `gates.failOnWarningCodes`: promote selected warning codes to hard failures.
- `gates.calibration.enabled`: `true` force-enables checks; `false` disables checks; unset uses auto mode (enabled when calibration suite metadata is present).
- `gates.calibration.suite`: calibration evidence suite id (default `judge-calibration`).
- `gates.calibration.maxAgeHours`: calibration recency window in hours (must be finite and > 0).
- `gates.calibration.allowBlockingWithoutRecentMatch`: downgrade blocking calibration failures to warnings.

## How

- Start with report-only visibility using `eval-dashboards lint` to understand warning distribution.
- Set permissive warning budgets first, then tighten over time.
- Move live workflows to `requiredPassingSuites: ['preflight']` before stricter judge thresholds.
- Emit `run.configSnapshot` in your runner for security-aware triage context.