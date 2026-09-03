# Community Partnership Log

Use this file to track outreach and pilot conversations for early runner partnerships.

## Template

| Date | Channel | Contact/Org | Stage | Outcome | Next action |
|---|---|---|---|---|---|
| 2026-08-04 | GitHub discussion | TBD | planned | Added to outreach queue | Send intro with examples/vitest-evals |
| 2026-09-03 | Self-initiated integration (no outreach sent) | assistant-ui/assistant-ui | pilot | Built and verified a local adapter against their real `evals/` harness (18 real rows, reproduced their own documented A/B finding). Full write-up: `docs/case-studies/assistant-ui/README.md`. Not yet `adopted` — integration is local-only, no PR opened. | Decide whether to open a real PR upstream; if yes, lead with the case study's findings rather than a cold "please adopt this schema" pitch |

## Stage definitions

- `planned`: candidate identified, no outreach sent yet
- `contacted`: first outreach sent
- `discovery`: conversation active, requirements gathered
- `pilot`: partner is testing integration
- `adopted`: partner emits `eval-report/v1` and uses dashboards in workflow
- `paused`: opportunity parked temporarily

## Outreach packet

Share these links for each outreach:

- `README.md`
- `docs/taxonomy.md`
- `examples/vitest-evals/README.md`
- `examples/jest-custom-reporter/README.md`
- `examples/node-plain-eval/README.md`
- `docs/github-approval-gate-pattern.md`
