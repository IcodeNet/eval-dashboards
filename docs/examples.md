# Examples

Required examples live under `examples/`:

- `basic-json`
- `agent-quality-preset`
- `jest-custom-reporter`
- `vitest-evals`
- `llm-agent-evals`
- `github-actions`
- `azure-devops`
- `static-html-dashboard`
- `custom-reporter-plugin`

Start with:

```sh
pnpm dev report --input=examples/basic-json --reporter=html --report-dir=eval-report
```

## `basic-json`

Use this when you already have `eval-report/v1` JSON and only want to generate reports:

```sh
pnpm dev report --input=examples/basic-json --reporter=html --reporter=text --report-dir=eval-report
pnpm dev publish --target=dir --input=examples/basic-json --report-dir=eval-report --out-dir=published-eval-report
```

The sample runs include suite manifests and rubric contracts, so the generated summary can show baseline compatibility.

## `agent-quality-preset`

Use this when you are starting an agent or assistant eval program and want copyable suite, dataset, and rubric conventions before writing a custom runner:

```sh
pnpm dev lint --input=examples/agent-quality-preset/artifacts
pnpm dev check --input=examples/agent-quality-preset/artifacts --allow-blocked-baseline
pnpm dev report --input=examples/agent-quality-preset/artifacts --reporter=html --reporter=json-summary --report-dir=eval-report
```

The fixture includes the planned agent-quality presets from [suite-presets.md](suite-presets.md), starter JSONL cases, and rubric contracts. Treat the suite names as setup defaults, not required `eval-report/v1` enum values.

## `llm-agent-evals`

Use this as the reference for agent/chat evals. It is provider-free and local, but it mirrors the shape a real assistant playground should follow:

1. Define scenarios with stable ids and rubric expectations.
2. Run those scenarios through an agent or chat runtime.
3. Capture agent evidence: input, output, tool calls, prompt version, agent version, channel, and latency.
4. Score answer quality with a judge. The example judge is rule-based so it can run without secrets, but the emitted fields match an LLM judge result.
5. Write `eval-report/v1` artifacts.
6. Generate reports and gates from those artifacts.

```sh
pnpm example:llm-agent-report
```

Generated artifacts are written under `examples/llm-agent-evals/.evals_output/` and are intentionally ignored by git/npm packaging. The source of truth is the runner script.

## Applying This To A Real Agent Playground

For a real local agent or assistant playground, keep the same artifact boundary:

- Replace `runLocalAgent` with your chat runtime call.
- Keep scenario ids stable across runs.
- Record the prompt version and agent version for every row.
- Put provider-specific request ids, token counts, or trace urls in `metadata`.
- Keep `suiteManifests.datasetVersion` and `suiteManifests.rubricVersion` stable unless the dataset or rubric actually changed.
- Add a second run before judging improvement, because latest-vs-previous comparisons need a baseline.

## Planned Examples

The remaining folders are intentionally present as v1 targets and still need full implementations:

- `jest-custom-reporter`: custom Jest reporter that writes eval artifacts.
- `vitest-evals`: Vitest suite that emits artifacts after test execution.
- `github-actions`: report, check, and publish workflow.
- `azure-devops`: report, check, and publish pipeline.
- `static-html-dashboard`: committed dashboard output sample.
- `custom-reporter-plugin`: extension pattern for custom reporters.