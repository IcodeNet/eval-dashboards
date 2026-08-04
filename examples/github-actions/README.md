# GitHub Actions Examples

These workflows show progressive setups for CI quality gates and reviewer approval flows.

- `eval-quality.yml`: baseline CI flow (emit artifacts, lint/check/report, publish).
- `eval-approval-gate.yml`: environment approval gate that updates `eval/quality-gate` commit status.
- `cleanup-pr-eval-results.yml`: removes stale `pr/<number>/` data from the publish branch when PRs close.

Recommended reading before adopting the approval flow:

- `docs/github-approval-gate-pattern.md`