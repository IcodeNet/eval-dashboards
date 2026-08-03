# Agent and LLM Judge Evals Example

This is a provider-free local chat playground. It simulates two versions of the same agent, runs scenarios through a tiny knowledge-base tool, emits `eval-report/v1` artifacts, then lets `@icodenet/eval-dashboards` generate reports from those artifacts.

Run it from the repo root:

```sh
pnpm example:llm-agent-evals
pnpm dev report --input=examples/llm-agent-evals/.evals_output --reporter=html --reporter=text --report-dir=eval-report
pnpm dev check --input=examples/llm-agent-evals/.evals_output --min-pass-rate=0.75 --max-new-failures=1 --zero-critical
```

The example writes two runs:

- `demo-agent-v1.json`: weaker prompt behavior with forbidden or missing rubric evidence.
- `demo-agent-v2.json`: improved prompt behavior with the same dataset and rubric versions.

The emitted rows demonstrate both sides of the contract:

- `kind: "agent"`: live agent behavior such as tool use, agent version, channel, prompt version, input, output, and latency.
- `kind: "llm-judge"`: judge-scored answer quality with rubric id, judge verdict, judge category, judge reasoning, and severity.

The suite manifest and rubric contract are included in every run so report comparisons can say whether a latest-vs-baseline trend is meaningful.