# Teach Labs: Delivery-Stage Workflows

These labs are designed as a gradual learning path.

They do not start with commands.
They start with the concept, why it matters, and what question each lab answers.

Use these labs after reading [docs/teach-curriculum.md](../teach-curriculum.md).

Repo-clone requirement: these labs assume you are running from this repository checkout (not only from an installed npm tarball), because they execute local scripts under `scripts/` and read tracked fixture artifacts under `examples/`.

## Learning progression

1. Understand evidence flow in local development
   - [Lab 01: Local dev loop](./01-local-dev-loop.md)
2. Convert evidence into a pre-PR gate decision
   - [Lab 02: Pre-PR gating](./02-pre-pr-gating.md)
3. Turn gate + comparison data into reviewer triage
   - [Lab 03: PR review triage](./03-pr-review-triage.md)
4. Build a release decision packet
   - [Lab 04: Release readiness](./04-release-readiness.md)
5. Run the same evidence loop after release
   - [Lab 05: Post-release monitoring](./05-post-release-monitoring.md)
6. Apply the full loop as an FDE operating model
   - [FDE role workflow lab](./fde-role-workflow.md)

## Shared concept across all labs

Every lab reinforces one core concept:

artifact-first evaluation delivery

That means every decision (ship, block, triage, monitor) must be backed by concrete artifacts, not narrative alone.

The four evidence classes used repeatedly are:

- history
- progress
- gate decision
- row-level detail analysis

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

A lab is complete only when the learner can answer:

- What concept did this lab teach?
- Why does it matter in delivery?
- What decision can now be made from evidence?

And can show all four evidence classes from artifacts.