# Benchmark pack templates

Phase 4B.8 introduces versioned benchmark pack templates so teams can bootstrap comparable suite bundles without changing `eval-report/v1`.

These templates are optional and runner-agnostic.

Location:

- `examples/benchmark-packs/safety-pack.v1.json`
- `examples/benchmark-packs/tool-routing-pack.v1.json`
- `examples/benchmark-packs/groundedness-pack.v1.json`

## What a benchmark pack is

A benchmark pack is a versioned plan for suites you should run together.
It defines suite intent, governance defaults, and compatibility expectations.
It does not replace your runner or artifact schema.

## Compatibility guidance

Keep packs compatible with `eval-report/v1` by treating them as templates over existing fields:

- Required row shape remains unchanged: `id`, `suite`, `passed`.
- Required report shape remains unchanged: `schemaVersion`, `run`, `suites`, `rows`.
- Suite governance should map to existing manifest fields:
  - `name`
  - `riskArea`
  - `target`
  - `datasetVersion`
  - `datasetSource`
  - `rubricVersion`
  - `graders`
  - `gate.mode` + `gate.thresholds`
- Optional evidence fields (`durationMs`, `score`, `trace`) should be emitted when available.
- Use valid `datasetSource` enum values from `eval-report/v1`: `synthetic`, `labelled-synthetic`, `production-sample`, `manual`, `custom`.
- `maxNewFailures` is configured at top-level gates config (`eval-dashboards.config.*`), not per-suite `suiteManifests[].gate.thresholds`.

## Using a template pack

1) Copy one template pack into your repo.
2) Apply suite entries to your `suiteManifests` and dataset/rubric files.
3) Emit run artifacts in `eval-report/v1`.
4) Validate and gate with existing commands:

```sh
eval-dashboards check --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-dashboard
```

## Frontier view notes

The cost/latency-quality frontier sections are shown only when row-level metrics are present:

- Latency frontier requires `rows[].durationMs` plus a quality signal.
- Cost frontier requires `rows[].metadata.costUsd` (or `costUSD`, `usdCost`, `cost.usd`, `pricing.costUsd`) plus quality.
- If any row includes numeric `score`, frontier quality uses scored rows only.
- If no rows include numeric `score`, frontier quality falls back to pass/fail (`passed=true => 1`, `passed=false => 0`).
- Quality is treated as higher-is-better on a comparable scale across included rows.
- Cross-suite frontier comparison assumes rows share a comparable rubric scale; if suites use different scoring scales, split frontiers per suite.
- Cost alias lookup skips invalid/negative values and uses the first non-negative alias candidate.

No additional schema version is required for this feature.
