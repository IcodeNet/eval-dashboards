# Publishing

Publishing adapters are mandatory v1 scope.

Targets:

- `dir`
- `github-pages`
- `azure-static-webapp`
- `azure-storage`

The current bootstrap implements `dir` and dry-run validation for cloud targets. Production upload support is tracked in [STATUS.md](STATUS.md).

Examples:

```sh
eval-dashboards publish --target=dir --input=.evals_output --report-dir=eval-report
eval-dashboards publish --target=github-pages --dry-run --repo=icodenet/eval-dashboard
eval-dashboards publish --target=azure-static-webapp --dry-run --app-name=eval-dashboard
eval-dashboards publish --target=azure-storage --dry-run --account=myevalreports --container='$web'
```