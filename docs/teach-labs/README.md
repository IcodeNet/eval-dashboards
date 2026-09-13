# Teach Labs: Delivery-Stage Workflows

These labs show how to use eval-dashboards artifacts across delivery stages, with concrete commands and expected outputs.

Use these labs after reading [docs/teach-curriculum.md](../teach-curriculum.md).

Repo-clone requirement: these labs assume you are running from this repository checkout (not only from an installed npm tarball), because they execute local scripts under `scripts/` and read tracked fixture artifacts under `examples/`.

## Stage map

1. [Local dev loop lab](./01-local-dev-loop.md)
2. [Pre-PR gating lab](./02-pre-pr-gating.md)
3. [PR review triage lab](./03-pr-review-triage.md)
4. [Release readiness lab](./04-release-readiness.md)
5. [Post-release monitoring lab](./05-post-release-monitoring.md)
6. [FDE role workflow lab](./fde-role-workflow.md)

## Shared fixture and artifact set

All labs use deterministic fixture data and tracked outputs:

```sh
./scripts/generate-report-power-artifacts.sh
```

Generated artifact root: `examples/report-power-artifacts/`

- History trends: `report/history.json`
- Progress/comparison: `report/summary.json`
- Gate outcomes: `gates/check-pass.json`, `gates/check-fail.json`
- Row-level detail analysis: `report/summary.json` comparison sections + `report/index.html`

## Lab completion rule

A lab is complete only when you can show all four evidence types:

- history
- progress
- gate decision
- row-level detail analysis
