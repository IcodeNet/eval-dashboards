# Community Partnership Log

Use this file to track outreach and pilot conversations for early runner partnerships.

## Template

| Date | Channel | Contact/Org | Stage | Outcome | Next action |
|---|---|---|---|---|---|
| 2026-08-04 | GitHub discussion | TBD | planned | Added to outreach queue | Send intro with examples/vitest-evals |
| 2026-09-03 | Self-initiated integration; draft PR submitted 2026-10-08 | assistant-ui/assistant-ui | pilot | Built and verified an adapter against the real `evals/` harness, expanded it with two reproducible repository-risk suites, preserved real Claude agent/judge evidence, and opened [draft PR #9044](https://github.com/assistant-ui/assistant-ui/pull/9044). This remains a pilot until maintainers accept and use it. | Inspect the pending external review, address valid findings, and wait for maintainer feedback |

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
