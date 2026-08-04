# GitHub Approval Gate Pattern for Eval Dashboards

This pattern turns eval results into a merge gate using only GitHub-native pieces:

1. A data branch (for example `eval-results`) stores static dashboard assets and eval JSON.
2. GitHub Pages serves that branch.
3. A workflow posts a commit status (for example `eval/quality-gate`) on the PR commit.
4. A protected environment pauses for human approval before posting final success or failure.

This guidance is adapted from a production implementation and generalized for teams using `@icodenet/eval-dashboards`.

## Why this pattern

- No new server is required.
- Reviewers get a stable URL for each PR's eval output.
- Approval is auditable in GitHub Actions and branch protection.
- The same artifacts power local debugging, CI reports, and merge decisions.

## Branch layout

Use one branch as a static database plus static site root.

```text
eval-results/
├── index.html                     # built dashboard app (optional if you use only HTML reporter)
├── assets/                        # static app assets
├── main/
│   ├── latest.json                # latest eval-report/v1 for main
│   ├── report.html                # optional pre-rendered report output
│   └── history/
│       ├── index.json             # manifest of history entries
│       └── YYYY-MM-DD-SHA.json    # archived runs
├── pr/
│   ├── index.json                 # manifest for recent PR runs
│   └── <number>/
│       ├── latest.json
│       ├── report.html
│       └── pr-meta.json           # source commit SHA + dashboard URL
└── branches/
    └── <name>/                    # optional non-PR branch outputs
```

### Recommended retention caps

- `main/history/index.json`: keep most recent 90 entries.
- `pr/index.json`: keep most recent 30 PR entries.

This keeps manifests fast to fetch while retaining trend context.

## Ownership model

| Concern | Owner |
|---|---|
| Emit eval artifact (`eval-report/v1`) | Test runner / CI eval job |
| Generate report output (`report`) | CI eval job |
| Publish files to data branch | CI eval job (`publish`) |
| Post initial pending status | CI eval job |
| Pause for reviewer approval | GitHub environment workflow |
| Post final success/failure status | GitHub environment workflow |
| Enforce merge requirement | Branch protection |

## Status context contract

Use one stable status context, such as `eval/quality-gate`.

State transitions:

1. `pending`: eval results published, waiting for reviewer decision.
2. `success`: reviewer approved.
3. `failure`: reviewer rejected or approval workflow failed.

Branch protection should require this status check for eval-relevant PRs.

## Environment approval flow

1. Eval job publishes PR results to `pr/<number>/` and writes `pr-meta.json`.
2. Eval job posts `pending` status to the PR commit.
3. Approval workflow reads `pr-meta.json`, targets environment `eval-approval`, and waits for reviewers.
4. When approved, workflow posts `success`; when rejected, workflow posts `failure`.

`pr-meta.json` should include:

```json
{
  "pr_number": 123,
  "source_commit_sha": "abc123...",
  "source_branch": "feature/my-change",
  "dashboard_url": "https://org.github.io/repo/#/pr/123",
  "published_at": "2026-08-04T12:00:00.000Z"
}
```

## Permissions and secrets

Recommended least privilege:

- Eval publish workflow token: `contents: write`, `statuses: write`.
- Approval workflow token: `statuses: write`, `deployments: write`.
- Avoid broad `contents: write` in approval jobs that only update statuses.

If approval workflow uses `actions/github-script`, pass the token explicitly via `github-token`.

## Reliability rules

1. If publishing to data branch fails, fail fast; do not silently serve stale outputs.
2. Retry loops must re-fetch and rebuild the worktree per attempt, not just re-push the same failed commit.
3. Do not write PR-only metadata on main/non-PR runs.
4. Keep deploy and data-publish concerns separated so dashboard redeploys do not overwrite history data.

## Manual setup checklist

1. Create and push the data branch (for example `eval-results`).
2. Enable GitHub Pages from that branch root.
3. Create protected environment (for example `eval-approval`) and add required reviewers.
4. Add secret token used to post commit statuses.
5. Add branch protection requirement for `eval/quality-gate`.
6. Run a smoke PR to verify pending -> approved/rejected status transitions.

## Mapping to eval-dashboards CLI

Typical sequence in CI:

```sh
# 1) your runner emits eval-report/v1 into .evals_output/
npx @icodenet/eval-dashboards lint --input=.evals_output
npx @icodenet/eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
npx @icodenet/eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-dashboard
npx @icodenet/eval-dashboards publish --input=.evals_output --report-dir=eval-dashboard --target=github-pages --repo=<owner/repo> --branch=eval-results
```

Use this with the companion workflow examples in `examples/github-actions/`.
