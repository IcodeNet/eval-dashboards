# Integrations: "Works with" Guides

`@icodenet/eval-dashboards` is runner-agnostic and artifact-first.

If you can export rows and map them into `eval-report/v1`, you can use the same `lint`, `check`, `report`, `history`, and `publish` flow.

## Supported import adapters in CLI today

```sh
eval-dashboards import --from=promptfoo --input=./promptfoo.json --out=.evals_output/promptfoo.json
eval-dashboards import --from=deepeval --input=./deepeval.json --out=.evals_output/deepeval.json
eval-dashboards import --from=openevals --input=./agentevals-like.json --out=.evals_output/openevals.json
```

(`openevals` is an alias for the AgentEvals adapter.)

## Works with pages

- [Promptfoo](./promptfoo.md)
- [DeepEval](./deepeval.md)
- [OpenAI eval surfaces / AgentEvals](./openevals-agentevals.md)
- [Anthropic eval methodology](./anthropic-eval-methodology.md)
- [Langfuse](./langfuse.md)
- [W&B Weave](./wandb-weave.md)
- [Arize Phoenix](./arize-phoenix.md)
- [Braintrust](./braintrust.md)
- [Ragas](./ragas.md)
- [TruLens](./trulens.md)
- [Patronus](./patronus.md)
- [Trace/observability stacks](./trace-stacks.md)

## Integration risk register

Before adding or changing an integration, check:

- [Integration risk register](./risk-register.md)
