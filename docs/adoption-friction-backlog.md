# Documentation Adoption Friction Backlog

Use this file to track adoption friction as documentation work.

Status values: Open, In Progress, Blocked, Done.
Severity values: Critical, High, Medium, Low.

| ID | Opened | Area | Signal source | Friction signal | Severity | Owner | Status | Next action |
|---|---|---|---|---|---|---|---|---|
| DOC-F001 | 2026-09-12 | Getting Started | Maintainer review: page-to-action check (Getting Started) | New users ask where to put emitted artifacts when using non-default repo layout. | High | Docs maintainer | Open | Add explicit "artifact location patterns" section with monorepo and polyrepo examples. |
| DOC-F002 | 2026-09-12 | Integrations | Maintainer review: integration guide refresh | Teams ask how to prove adapter output is still `eval-report/v1` compatible after upstream tool updates. | High | Schema owner | Open | Add adapter verification checklist + `eval-dashboards lint/check` command block to each integration guide. |
| DOC-F003 | 2026-09-12 | Publishing | Maintainer review: publishing page-to-action check | Users confuse local report output directory vs published site path. | Medium | Release captain | Open | Add one diagram and one before/after path example in `docs/publishing.md`. |
| DOC-F004 | 2026-09-12 | CLI help snapshots | CI verifier output (`scripts/verify-cli-init-and-completion.sh`) | Contributors change help text but forget to refresh snapshots. | Medium | Maintainers | In Progress | Keep verifier enforcing exact snapshot match and add "how to refresh" command in `docs/cli-help/README.md`. |
| DOC-F005 | 2026-09-12 | Trace evidence | Maintainer review: integration trace examples | Users add `traceId` but skip deep links and cannot jump from row to trace UI quickly. | Medium | Integrations maintainer | Open | Add one more trace-link example for an integration import flow. |

## Review cadence

- Review weekly during adoption-metrics loop.
- Close only when docs change is merged and verified.
- Reference friction IDs in roadmap/status updates when a docs slice resolves them.
