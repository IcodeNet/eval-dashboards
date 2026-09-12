# Works with Anthropic eval methodology

## What it does well

- Clear methodology around task decomposition, rubric clarity, and evaluator reliability.
- Strong emphasis on safety and refusal behavior for agentic systems.

## Tradeoffs

- Methodology guidance does not itself enforce one artifact contract.
- Teams can drift if rubric/version metadata is not made explicit in emitted rows.

## Minimal conversion path into `eval-report/v1`

Keep your Anthropic-style eval flow, but emit rows with stable ids and rubric/dataset versions.

- Map each scenario result into one `rows[]` entry.
- Put evaluator metadata into first-class fields where possible (`judgeModel`, `judgeVerdict`, `judgeReasoning`, `axisScores`).

## Concrete command/pattern

```sh
pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --source=anthropic-method --input=./anthropic-eval-export.json --out=./.evals_output/anthropic-import.json
eval-dashboards check --input=.evals_output
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
