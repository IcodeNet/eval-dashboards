# Reporters

Built-in reporters:

- `text`: terminal summary.
- `json-summary`: machine-readable summary.
- `markdown-summary`: PR and build summary.
- `html`: static dashboard.

Multiple reporters can be requested in one command:

```sh
eval-reports report --input=.evals_output --reporter=html --reporter=text
```