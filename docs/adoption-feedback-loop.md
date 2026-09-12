# Adoption Feedback Loop

This runbook makes docs-adoption measurement repeatable and ties friction directly to a documentation backlog.

## Weekly operating loop

1. Confirm `.github/workflows/adoption-metrics.yml` ran (or trigger it manually).
2. Review `docs/adoption-metrics/latest.json`.
3. Update `docs/adoption-metrics/manual-signals.json` with maintainer-verified outcomes.
4. Run page-to-action and cadence checks, then update `docs/adoption-friction-backlog.md`.
5. Prioritize next docs edits using the highest-severity unresolved friction items.
6. Log outreach and partnership stage changes in `docs/community-partnership-log.md`.

## Signals tracked (lightweight)

### 1) Page-to-action checks

Goal: each key docs page should let a new team complete one concrete action in under 10 minutes.

Track these checks weekly:

- Getting Started -> successful `init` run (`eval-dashboards init --preset=agent-quality --write`).
- CLI page -> successful `lint/check/report` run on one maintained example.
- Publishing page -> successful static publish dry run or target publish run.
- Integrations page -> successful `import` conversion for at least one external tool output.

If a check fails, open a new `DOC-F###` row in `docs/adoption-friction-backlog.md` before the review ends.

### 2) Integration example usage markers

Goal: know which interoperability docs are actually used.

Track these markers:

- Number of distinct integration pages updated in the last 30 days.
- Number of maintained examples validated by the `examples` job in `.github/workflows/ci.yml`.
- Number of verified external-tool import runs logged by maintainers.

### 3) Docs update cadence

Goal: prevent stale guidance.

Track these cadence checks:

- Days since last docs truth-sync commit touching README/ROADMAP/STATUS/publishing/examples/help snapshots.
- Days since last integration guide refresh.
- Days since last adoption-metrics refresh.

If any cadence check exceeds 30 days, open a new `DOC-F###` row in the backlog.

## Ownership

- Workflow owner: repository maintainers.
- Metrics refresh owner: repository maintainers.
- Friction triage owner: repository maintainers.

## Friction triage policy

- Every unresolved docs friction item must live in `docs/adoption-friction-backlog.md` with severity, owner, and next action.
- Assign the next sequential `DOC-F###` identifier when adding an item.
- Include signal source and opened date so priority is based on observed friction, not intuition.
- Friction items are documentation backlog work, not only product backlog work.

## Exit criteria for healthy adoption loop

All conditions must be true for two consecutive weekly reviews:

- Page-to-action checks pass for Getting Started, CLI, Publishing, and Integrations.
- Friction backlog has no unresolved Critical items older than 14 days.
- At least one external-tool import path is verified during the week.
- Docs cadence checks are green (no key doc stale for >30 days).

## Notes

- For weekly checks, record pass/fail outcomes in the friction backlog and use `manual-signals.json` `notes` for a one-line summary.
- External adoption outcomes are ongoing KPIs; completion means the loop exists and is actively used.
- Keep this process runner-agnostic and artifact-first: prioritize `eval-report/v1` conversion quality over tool-specific UI flows.
