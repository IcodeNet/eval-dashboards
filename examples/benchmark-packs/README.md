# Benchmark pack templates (v1)

These templates provide reusable suite bundles for common evaluation goals.
They are input planning artifacts, not a new report schema.

Included packs:

- `safety-pack.v1.json`
- `tool-routing-pack.v1.json`
- `groundedness-pack.v1.json`

Each pack includes:

- `packVersion` for template versioning
- `evalReportCompatibility` for explicit contract mapping
- suite entries with governance defaults (`name`, valid `datasetSource`, `riskArea`, gate thresholds)

Threshold note: suite-manifest thresholds in these templates are pass-rate/critical style controls. New-failure budgets (`maxNewFailures`) are configured at top-level gate config, not inside suite manifests.

Use them to seed your own `suiteManifests`, datasets, and rubrics, then emit normal `eval-report/v1` run artifacts.
