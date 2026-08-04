# Agent Quality Preset Template

This folder is a copyable starting point for agent and assistant eval programs. It demonstrates how suite presets, datasets, rubrics, and `eval-report/v1` artifacts fit together without requiring a specific eval runner.

## Files

| File | Purpose |
|---|---|
| `artifacts/run-agent-quality-template.json` | Runnable `eval-report/v1` artifact with suite manifests, rubric contracts, rows, and dataset changelog metadata. |
| `datasets/agent-quality-cases.jsonl` | Starter JSONL dataset with stable ids, suite names, expected evidence, lifecycle, and provenance. |
| `rubrics/agent-quality-rubrics.json` | Starter rubric contracts for common agent quality suites. |

## Try It

```sh
eval-dashboards lint --input=examples/agent-quality-preset/artifacts
eval-dashboards check --input=examples/agent-quality-preset/artifacts --allow-blocked-baseline
eval-dashboards report --input=examples/agent-quality-preset/artifacts --reporter=html --reporter=json-summary --report-dir=eval-report
```

For local development from this repo, replace `eval-dashboards` with `pnpm dev`.

## How To Adapt

1. Keep stable case ids in the dataset.
2. Rename suites only if the names better match your product language.
3. Bump `datasetVersion` when case meaning changes.
4. Bump `rubricVersion` when scoring rules, axes, judge prompts, or thresholds change.
5. Emit rows with the evidence needed to explain each pass or failure.
6. Treat generated dashboards as the canonical report surface; host apps should link or embed them instead of rebuilding summary cards.

Starter coverage now includes must-have domains commonly used in production AI eval programs:

- `tone-of-voice` and `factuality` signals in `answer-quality`
- `content-safety` refusal checks for harmful requests
- existing retrieval/groundedness/prompt-safety/tool-routing/judge-calibration baselines
