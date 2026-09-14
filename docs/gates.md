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

Notification adapters (opt-in):

- `--notify=<channel>` enables one or more channels (`slack`, `teams`, `email`) when a blocking gate fails or baseline compatibility is blocked.
- `--notify-webhook=<url>` sets a shared webhook URL fallback for Slack or Teams.
- `--notify-slack-webhook=<url>` and `--notify-teams-webhook=<url>` set channel-specific webhook URLs.
  - Teams notifications are sent as Adaptive Card webhook payloads.
  - When both `slack` and `teams` are enabled, provide channel-specific URLs (shared webhook fallback is rejected).
- `--notify-email-smtp=<url>`, `--notify-email-from=<address>`, `--notify-email-to=<address>` configure SMTP email notifications.
- `--notify-report-link=<url-or-path>` overrides the link/path included in payloads (default: `<report-dir>/index.html`).
- `--calibration-suite=<id>` overrides the calibration evidence suite id (default: `judge-calibration`).
- `--calibration-max-age-hours=<n>` sets recency window for calibration evidence (default: `168`; must be finite and `> 0`).
- `--calibration-preflight` force-enables calibration preflight checks.
- `--allow-stale-calibration` is the escape hatch: missing/stale calibration evidence is downgraded to diagnostics instead of failing blocking suites.
- `--no-calibration-preflight` disables calibration preflight checks.
- Environment fallbacks are supported for CI secret hygiene: `EVAL_NOTIFY_CHANNELS`, `EVAL_NOTIFY_WEBHOOK`, `EVAL_NOTIFY_SLACK_WEBHOOK`, `EVAL_NOTIFY_TEAMS_WEBHOOK`, `EVAL_NOTIFY_SMTP_URL`, `EVAL_NOTIFY_EMAIL_FROM`, `EVAL_NOTIFY_EMAIL_TO`, `EVAL_NOTIFY_REPORT_LINK`.
- Notification delivery is best-effort: send failures/skips are captured in `check-result.json` (`diagnostics` and optional `notifications`) when `--json-out` is enabled, but do not change check exit codes.

Security note: prefer environment variables or config-file references for webhook/SMTP secrets. Avoid putting secret URLs directly in CLI flags in shared CI logs.

Example:

```sh
eval-dashboards check \
  --input=.evals_output \
  --max-new-failures=0 \
  --zero-critical \
  --notify=slack \
  --notify-webhook="$SLACK_WEBHOOK_URL" \
  --notify-report-link="https://example.github.io/my-repo/eval-report/index.html"
```

Config file equivalent:

```ts
export default {
  notifications: {
    channels: ['slack', 'teams', 'email'],
    reportUrl: 'https://example.github.io/my-repo/eval-report/index.html',
    slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL },
    teams: { webhookUrl: process.env.TEAMS_WEBHOOK_URL },
    email: {
      smtpUrl: process.env.EVAL_SMTP_URL,
      from: 'eval-bot@example.com',
      to: ['oncall@example.com'],
    },
  },
};
```

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

Mandatory calibration preflight for judge-scored suites:

- Applies when the current artifact includes the configured calibration suite manifest (default: `judge-calibration`), or when force-enabled via `--calibration-preflight` / `gates.calibration.enabled: true`.
- Runs on judge-scored suites in the current artifact (`llm-judge` / `human-labelled-calibration` graders), excluding the calibration suite id itself.
- Check requires a calibration evidence run within the recency window whose calibration rows include matching `judgeModel` and `groundTruthVerdict`.
- Rubric matching is evaluated against the calibration suite rubric contract (`judge-calibration`), not each target suite manifest rubric.
- Blocking suites require independent evidence: current-run calibration rows do not satisfy blocking gate checks.
- Report-only suites may self-certify against current-run calibration rows (diagnostic signal, not blocking enforcement).
- If a matching recent calibration run is missing:
  - `gate.mode=blocking`: check fails by default.
  - `gate.mode=report-only`: check emits a loud diagnostic warning.
- Suites that do not emit `judgeModel` values fail in `blocking` mode (unless `--allow-stale-calibration` is set), and emit warning-only diagnostics in `report-only` mode.
- Escape hatch: `--allow-stale-calibration` (or `gates.calibration.allowBlockingWithoutRecentMatch: true`) downgrades blocking failures to warnings.
- Force-enable path: `--calibration-preflight` (or `gates.calibration.enabled: true`).
- When the current artifact includes the configured calibration suite manifest, that suite must include rubric metadata (`rubricVersion` in suite manifest or rubric contract).
- Missing calibration rubric metadata in that case is treated as invalid artifact/config input (exit code `2`).
- Disable path: `--no-calibration-preflight` (or `gates.calibration.enabled: false`).
- Conflicting flags (`--calibration-preflight` and `--no-calibration-preflight`) fail fast with exit code `2`.
- Breaking behavior change: blocking suites now require independent calibration evidence; same-run calibration rows no longer satisfy blocking checks.

Config file equivalent:

```ts
export default {
  gates: {
    calibration: {
      enabled: true,
      suite: 'judge-calibration',
      maxAgeHours: 168,
      allowBlockingWithoutRecentMatch: false,
    },
  },
};
```
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

Fail on selected warning codes without enabling full strict mode:

```sh
eval-dashboards lint --input=.evals_output --fail-on-warning-code=orphan-scenario-reference --fail-on-warning-code=duplicate-dataset-case-id
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