# Product Requirement Prompt: @icodenet/eval-reports

Build a standalone npm package and repository named `@icodenet/eval-reports`. The package is the eval-reporting equivalent of NYC/Istanbul: runner-agnostic, artifact-first, configurable, report-generating, gate-enforcing, history-aware, and able to publish dashboards for stakeholders.

## Product Goal

Any team should be able to run its own evals, emit a standard JSON artifact, then use `@icodenet/eval-reports` to generate reports, track progress over time, enforce quality gates, and publish a static dashboard.

The user experience should feel like:

```sh
pnpm add -D @icodenet/eval-reports

my-eval-runner --output=.evals_output/run.json

eval-reports report --input=.evals_output --reporter=html --reporter=text
eval-reports check --min-pass-rate=0.9 --max-new-failures=0
eval-reports publish --target=github-pages
```

## Non-Negotiables

- Package name is `@icodenet/eval-reports`.
- Repository is independent and not inside any downstream adopter repository.
- No adopter-specific, vendor-specific, or single-runner assumptions in core.
- Publishing adapters are mandatory v1 scope.
- Examples are mandatory v1 scope.
- Static dashboard must work without a server.
- Artifact schema must be versioned from day one.
- CLI must be useful without writing code.
- Core must support offline operation from JSON artifacts.
- All user/model-provided text rendered into HTML must be escaped.

## Inspiration

Use NYC as the CLI and product inspiration:

- Familiar command model.
- Config in `package.json` or config file.
- Multiple reporters per run.
- `report`, `check`, and `merge` commands.
- Threshold gates.
- Clear examples for common runners.

Use IstanbulJS as the architecture inspiration:

- Separate artifact model from reporting.
- Normalize raw files into a report context.
- Reporters consume context, not raw files.
- Pure comparison/history/gate libraries under the CLI.
- Concrete built-in reporters with room for plugins later.

## Required CLI

```sh
eval-reports init
eval-reports report
eval-reports check
eval-reports merge
eval-reports history
eval-reports publish
```

`report` generates human and machine-readable reports.

`check` enforces gates and exits non-zero on failure.

`merge` combines multiple eval artifacts into one normalized artifact/history file.

`history` builds trend data from many runs.

`publish` generates or reuses a static report directory and publishes it through an adapter.

## Artifact Contract

Define `eval-report/v1` as the canonical contract. See [artifact-format.md](artifact-format.md).

The contract must support agent and LLM judge reports as first-class use cases. Rows should be able to carry dataset, scenario, rubric, judge model, judge verdict, judge category, judge reasoning, prompt version, agent channel, agent version, ground-truth labels, expected answer, actual output, score, pass/fail, category, and severity without forcing teams to encode those core concepts inside arbitrary metadata.

Suites should also support portable governance metadata: target, dataset source/version, rubric version, risk area, graders, gate policy, and rubric contracts. This lets teams compare progress over time without pretending two runs are equivalent when the dataset or rubric changed.

## Required Reporters

- `text`
- `json-summary`
- `markdown-summary`
- `html`

HTML output must produce:

```text
eval-report/
  index.html
  history.json
  summary.json
  assets/
```

Dashboard must show:

- Latest status.
- Overall pass rate.
- Suite pass rates.
- Newly failing rows.
- Newly passing rows.
- Persistent failures.
- Severity breakdown.
- Trend over time.
- Build, commit, and source links when present.
- Gate pass/fail result.
- Judge reasoning and rubric context for failed agent or LLM judge rows.
- Baseline compatibility status for latest-vs-previous comparisons.

## Required Gates

Support config and CLI flags for:

- Minimum overall pass rate.
- Minimum suite pass rate.
- Maximum newly failing rows.
- Maximum failures by severity.
- Zero critical failures.
- Explicit baseline comparison.

Exit codes:

- `0`: pass.
- `1`: gates failed.
- `2`: invalid config or artifact.
- `3`: no usable reports found.

## Required Publishing Adapters

Implement v1 adapters:

```sh
eval-reports publish --target=dir
eval-reports publish --target=github-pages
eval-reports publish --target=azure-static-webapp
eval-reports publish --target=azure-storage
```

Each adapter must support:

- `--dry-run`.
- Target-specific config validation.
- Safe secret handling.
- Useful CI log output.
- Non-zero exit on failure.
- Returned or printed URL when known.

Do not log tokens, connection strings, SAS values, or secrets.

## Required Examples

- `basic-json`: smallest valid JSON artifact and report generation.
- `jest-custom-reporter`: Jest emits eval artifacts.
- `vitest-evals`: Vitest eval suite emits artifacts.
- `llm-agent-evals`: fake provider-free LLM/agent evals.
- `github-actions`: report, check, publish to GitHub Pages.
- `azure-devops`: report, check, publish artifact or Azure target.
- `static-html-dashboard`: generated dashboard example.
- `custom-reporter-plugin`: demonstrates extension pattern.

## Acceptance Criteria

- `eval-reports report --input=examples/basic-json --reporter=html` creates a static dashboard.
- `eval-reports check` exits `1` when gates fail.
- Two runs can be compared and show newly failing and newly passing rows.
- `publish --target=dir` writes a complete static site.
- `publish --target=github-pages --dry-run` validates and prints intended publish actions.
- `publish --target=azure-static-webapp --dry-run` validates config and auth requirements.
- `publish --target=azure-storage --dry-run` validates config and auth requirements.
- Jest and Vitest examples work end to end.
- README explains the package as NYC/Istanbul for eval reports.
- No core code depends on any one eval runner, cloud provider, or LLM vendor.