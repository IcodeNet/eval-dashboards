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
- `kind: "llm-judge"` calibration rows: labelled examples with `groundTruthVerdict`, `groundTruthAxisScores`, and metadata that let the calibration gate compare judge output against known labels.

The suite manifest and rubric contract are included in every run so report comparisons can say whether a latest-vs-baseline trend is meaningful. The example also emits a `judge-calibration` suite so the calibration gate and report section have labelled rows to work with.

For axis-score design and calibration labeling guidance, see [docs/judge-axis-rubric-scales.md](../../docs/judge-axis-rubric-scales.md).

## How to map this to a real repo

This example is deliberately synthetic. To make it easier to reuse, read it as a template for your own runner rather than as a product you should copy verbatim:

| Example piece | Real repo meaning | Suggested replacement |
|---|---|---|
| `scenarios` | Dataset or fixture set | Load real cases from files, a database, or a domain-specific test source. |
| `runLocalAgent()` | Your runner | Call your actual agent, workflow, or service under test. |
| `searchKnowledgeBase()` | Tool or dependency boundary | Replace it with the real search, retrieval, API, or database call your runner uses. |
| `legacyPromptResponse()` / `improvedPromptResponse()` | Prompt or policy version | Point these at real prompt templates, instruction bundles, or commit SHAs. |
| `judgeAnswer()` | Rubric or scorer | Replace the heuristic with your production judge, rubric, or human review flow. |
| `local-chat-quality` | Main evaluation suite | Rename it to the business area your team actually tracks. |
| `judge-calibration` | Label-quality suite | Keep calibrated examples separate so you can measure judge agreement without mixing them into product evals. |

If you only do one thing, make one example row traceable from dataset to runner to rubric to report. That single path is what makes the example feel like a real repo instead of a demo script.