# Integrations: "Works with" Guides

These guides show how to use `@icodenet/eval-dashboards` alongside existing eval and observability tooling.

`eval-dashboards` stays runner-agnostic: if you can emit or convert to `eval-report/v1`, you can use the same `lint`, `check`, `report`, `history`, and `publish` workflow.

## Guides

- [Works with Promptfoo](./promptfoo.md)
- [Works with DeepEval](./deepeval.md)
- [Works with OpenEvals / AgentEvals](./openevals-agentevals.md)
- [Works with trace and observability stacks](./trace-stacks.md)

## Shared import command pattern

```sh
eval-dashboards import --from=<promptfoo|deepeval|agentevals|openevals> --input=./source.json --out=.evals_output/import.json
```

`openevals` is accepted as an alias for `agentevals`.
