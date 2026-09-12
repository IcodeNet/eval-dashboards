# Examples

Examples live under `examples/`.

Current example directories:

- `basic-json`
- `taxonomy-complete-fixture`
- `agent-quality-preset`
- `llm-agent-evals`
- `financial-domain-ollama-evals`
- `vitest-evals`
- `jest-custom-reporter`
- `node-plain-eval`
- `python-pytest-evals`
- `langchain-evals`
- `github-actions`
- `azure-devops`
- `static-html-dashboard`
- `custom-reporter-plugin`
- `screenshot-fixture`

Start with:

```sh
eval-dashboards report --input=examples/basic-json --reporter=html --report-dir=eval-report
```

## `basic-json`

Use this when you already have `eval-report/v1` JSON and only want to run report/check/publish.

```sh
eval-dashboards report --input=examples/basic-json --reporter=html --reporter=text --report-dir=eval-report
eval-dashboards publish --target=dir --input=examples/basic-json --report-dir=eval-report --out-dir=published-eval-report
```

Use a passing fixture for a "green" gate example:

```sh
eval-dashboards check --input=examples/agent-quality-preset/artifacts --allow-blocked-baseline
```

### Trace-first triage example (4C.9)

`examples/basic-json/run-trace-links.json` includes `rows[].trace` with `traceId`, `spanId`, `traceUrl`, and `spanUrl`.

```sh
eval-dashboards report --input=examples/basic-json --run-id=run-trace-links --reporter=html --report-dir=eval-report
```

Open `eval-report/index.html`, find row `agent/tool-timeout-001`, then follow the row-level trace/span links from the details panel. This demonstrates dashboard row -> trace deep link triage.

## `agent-quality-preset`

Use this when starting an agent-eval program and you want scaffolded suite/rubric/dataset conventions first.

```sh
eval-dashboards init --preset=agent-quality
eval-dashboards teach
eval-dashboards init --preset=agent-quality --write --dry-run
eval-dashboards lint --input=examples/agent-quality-preset/artifacts
eval-dashboards check --input=examples/agent-quality-preset/artifacts --allow-blocked-baseline
eval-dashboards report --input=examples/agent-quality-preset/artifacts --reporter=html --reporter=json-summary --report-dir=eval-report
```

## `llm-agent-evals`

Use this as a local reference for agent/chat eval rows with tool-call and judge evidence.

```sh
pnpm example:llm-agent-report
```

Generated artifacts are written under `examples/llm-agent-evals/.evals_output/`.

### Applying this to a real agent playground

- Replace the local runner call with your runtime call.
- Keep scenario ids stable across runs.
- Record `promptVersion` and `agentVersion` per row.
- Put provider request ids and trace refs in `metadata`/`trace` fields.

## `financial-domain-ollama-evals`

Use this for a real local-model eval run (Ollama) in a regulated-domain style workflow.

```sh
pnpm example:financial-domain-ollama-report
```

If Ollama is unavailable, treat this suite as opt-in infrastructure-dependent coverage.

## Implementation status

Runnable local examples:

- `vitest-evals`
- `jest-custom-reporter`
- `node-plain-eval`
- `python-pytest-evals`
- `langchain-evals`
- `llm-agent-evals`
- `financial-domain-ollama-evals`
- `agent-quality-preset`
- `basic-json`
- `taxonomy-complete-fixture`

CI templates and workflow examples:

- `github-actions`
- `azure-devops`

Reference/template examples:

- `static-html-dashboard`
- `custom-reporter-plugin`
- `screenshot-fixture`
