# Adoption Feedback Loop

This runbook closes the Phase 4 feedback-loop requirement by making adoption tracking repeatable and reviewable.

## Weekly loop

1. Run `pnpm metrics:adoption`.
2. Review `docs/adoption-metrics/latest.json`.
3. Update `docs/adoption-metrics/manual-signals.json` with:
   - confirmed external runner adoptions
   - confirmed schema citations
   - active outreach and pilot status
4. Log outreach activity in `docs/community-partnership-log.md`.
5. Add notable changes to `CHANGELOG.md` when they affect product direction.

## Signals and ownership

- Automated signals:
  - npm weekly downloads
  - GitHub stars/forks/issues
  - GitHub code-search count for schema citation hints
- Manual verified signals:
  - external runner adoptions
  - schema citations verified by maintainers
  - outreach started and active pilot count

## Exit criteria for partnership readiness

The outreach pipeline is healthy when all of the following are true:

- outreach started and tracked each week
- at least one active pilot exists
- at least one external runner has emitted taxonomy-complete artifacts

## Notes

- External adoption outcomes are real-world KPIs and remain ongoing.
- Roadmap completion here means the tracking and execution loop is implemented in-repo.
