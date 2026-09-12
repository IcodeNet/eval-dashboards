# Publishing

`eval-dashboards publish` renders a static dashboard and then publishes it to the selected target.

Supported targets:

- `dir`
- `github-pages`
- `azure-static-webapp`
- `azure-storage`

The command supports both live publish and preview mode (`--dry-run`).

## Command surface (truth-synced)

```sh
eval-dashboards publish [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --report-dir=<path>      Generated report directory. Default: eval-report
  --target=<name>          Publish target: dir|github-pages|azure-static-webapp|azure-storage
  --out-dir=<path>         Output directory for --target=dir. Default: published-eval-report
  --dry-run                Preview target actions without writing remote state

GitHub Pages target options:
  --repo=<owner/repo>      Required for --target=github-pages
  --branch=<name>          Target branch. Default: gh-pages
  --token=<token>          Optional GitHub token override (else uses GITHUB_TOKEN)

Azure Static Web App target options:
  --app-name=<name>        Required for --target=azure-static-webapp

Azure Storage target options:
  --account=<name>         Required for --target=azure-storage
  --container=<name>       Blob container. Default: $web
```

## Operational notes

- `dir` is local-only and preserves offline-first behavior.
- `github-pages` needs `--repo` and a GitHub token (`GITHUB_TOKEN` or `--token`).
- `azure-static-webapp` and `azure-storage` require authenticated Azure CLI and access to the target resource.

## Examples

```sh
eval-dashboards publish --target=dir --input=.evals_output --report-dir=eval-report --out-dir=published-eval-report

eval-dashboards publish --target=github-pages --dry-run --repo=IcodeNet/eval-dashboards
eval-dashboards publish --target=github-pages --repo=IcodeNet/eval-dashboards --branch=gh-pages

eval-dashboards publish --target=azure-static-webapp --dry-run --app-name=eval-dashboard
eval-dashboards publish --target=azure-static-webapp --app-name=eval-dashboard

eval-dashboards publish --target=azure-storage --dry-run --account=myevalreports --container='$web'
eval-dashboards publish --target=azure-storage --account=myevalreports --container='$web'
```

GitHub reviewer-gated merge pattern:

- `docs/github-approval-gate-pattern.md`
- `examples/github-actions/eval-quality.yml`
- `examples/github-actions/eval-approval-gate.yml`
- `examples/github-actions/cleanup-pr-eval-results.yml`
