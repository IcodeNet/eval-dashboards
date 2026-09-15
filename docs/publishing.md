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
  --redact                 Strip sensitive evidence text (prompts, outputs, judge/agent reasoning,
                           tool call args/results, questions) before rendering and publishing;
                           only the public tier (ids, counts, rates, categories, severities,
                           verdicts, versions) is emitted.
  --allow-sensitive-publish  Override the publish preflight hard-fail that triggers when
                           unredacted sensitive evidence fields are present in the payload.
                           Use of this override is always recorded in publish-run-record.json.
  --bypass-log=<path>      Append a JSON-lines bypass-usage record when --allow-sensitive-publish
                           was actually needed (i.e. sensitive fields were present); also
                           configurable via bypassLogFile in the config file.

Publish preflight:
  Publishing fails (exit code 2) when the report being published still contains
  sensitive evidence fields (question, input, output, expected, reason,
  judgeReasoning, agentReasoning, groundTruthAnnotation, turn content, tool
  call results) and --allow-sensitive-publish was not passed. Pass --redact to
  strip these fields, or pass --allow-sensitive-publish to publish anyway.

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
- `azure-storage` requires authenticated Azure CLI and access to the target resource.
- `azure-static-webapp` currently supports dry-run validation only; non-dry-run returns a clear not-implemented error until a verified execution path lands.

## Examples

```sh
eval-dashboards publish --target=dir --input=.evals_output --report-dir=eval-report --out-dir=published-eval-report

eval-dashboards publish --target=github-pages --dry-run --repo=IcodeNet/eval-dashboards
eval-dashboards publish --target=github-pages --repo=IcodeNet/eval-dashboards --branch=gh-pages

eval-dashboards publish --target=azure-static-webapp --dry-run --app-name=eval-dashboard
# non-dry-run currently returns a not-implemented error

eval-dashboards publish --target=azure-storage --dry-run --account=myevalreports --container='$web'
eval-dashboards publish --target=azure-storage --account=myevalreports --container='$web'
```

GitHub reviewer-gated merge pattern:

- `docs/github-approval-gate-pattern.md`
- `examples/github-actions/eval-quality.yml`
- `examples/github-actions/eval-approval-gate.yml`
- `examples/github-actions/cleanup-pr-eval-results.yml`
