# Works with OpenAI eval surfaces / AgentEvals

## What these surfaces do well

- OpenAI eval surfaces and AgentEvals-style outputs are useful for model/agent regression loops.
- Strong ecosystem momentum and shared examples.

## Tradeoffs

- Result payload shape can change between SDK/runtime versions.
- Provider-native fields are not always stable cross-vendor.

## Minimal conversion path into `eval-report/v1`

Use the built-in `agentevals` adapter (`openevals` alias supported).

- Required: JSON with `rows[]` or `results[]` carrying row ids and pass/fail signals.
- Output: `eval-report/v1` artifact with normalized row and provenance fields.

## Concrete command/pattern

```sh
eval-dashboards import --from=openevals --input=./openevals-results.json --out=.evals_output/import-openevals.json
eval-dashboards check --input=.evals_output --allow-blocked-baseline
eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
```

Related risks: [integration risk register](./risk-register.md)
