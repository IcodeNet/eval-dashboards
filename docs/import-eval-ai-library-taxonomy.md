# `eval-ai-library` Metric-to-Taxonomy Mapping

Cross-linked from [taxonomy.md](./taxonomy.md#6-import-adapter-metric-mappings).

[`eval-ai-library`](https://github.com/meshkovQA/eval-ai-library) (docs:
[library.eval-ai.com](https://library.eval-ai.com/)) is a Python evaluation harness for RAG
systems, agents, and LLM security testing — it is **not** a reporting/gating layer and is out
of category for this repo, but teams already using it can import its output with
`eval-dashboards import --from=eval-ai-library` (see [artifact-format.md](artifact-format.md)
and the CLI help in `docs/cli-help/import.txt`).

`eval-ai-library` emits `TestCaseResult` objects, each carrying a `metrics_data: MetricResult[]`
array of named metrics (per its
[API reference](https://library.eval-ai.com/advanced/api-reference/)). The adapter in
`src/cli/import-adapters.ts` (`evalAiLibraryRows`, `EVAL_AI_LIBRARY_METRIC_TAXONOMY`) maps those
metric names onto this repo's row-level `category` and suite-level `riskArea`
([taxonomy.md §1.2](./taxonomy.md#12-classify-the-row-strongly-recommended) and
[§2.1](./taxonomy.md#21-define-the-suite-purpose)) taxonomy fields, so adopters have a direct
mapping instead of guessing.

This is a **documentation/conversion mapping only** — no `eval-ai-library` harness or scoring
logic is imported or reimplemented; the adapter only converts already-computed
scores/verdicts into `eval-report/v1` rows.

| `eval-ai-library` metric | Category | Suite `riskArea` |
|---|---|---|
| `answer_relevancy` | `relevance` | `relevance` |
| `answer_precision` | `relevance` | `relevance` |
| `faithfulness` | `groundedness` | `groundedness` |
| `contextual_relevancy` | `retrieval-quality` | `relevance` |
| `contextual_precision` | `retrieval-quality` | `relevance` |
| `contextual_recall` | `retrieval-quality` | `groundedness` |
| `bias` | `bias` | `content-safety` |
| `toxicity` | `toxicity` | `content-safety` |
| `restricted_refusal` | `over-refusal` | `response-quality` |
| `tool_correctness` | `tool-use` | `tool-use` |
| `task_success_rate` | `task-completion` | `response-quality` |
| `goal_achievement_rate` | `task-completion` | `response-quality` |
| `conversational_flow_rate` | `conversation-quality` | `response-quality` |
| `repetitive_pattern_detection` | `repetition` | `response-quality` |
| `failure_rate` | `reliability` | `response-quality` |
| `role_adherence` | `role-adherence` | `tone-of-voice` |
| `knowledge_retention` | `knowledge-retention` | `factuality` |
| `tools_error` | `tool-use` | `tool-use` |
| `prompt_injection_detection` | `prompt-injection` | `prompt-safety` |
| `jailbreak_detection` | `jailbreak` | `prompt-safety` |
| `pii_leakage` | `pii-leakage` | `pii` |
| `harmful_content` | `harmful-content` | `content-safety` |
| `prompt_injection_resistance` | `prompt-injection` | `prompt-safety` |
| `jailbreak_resistance` | `jailbreak` | `prompt-safety` |
| `policy_compliance` | `policy-compliance` | `compliance` |
| `exact_match` | `correctness` | `factuality` |
| `semantic_similarity` | `correctness` | `factuality` |
| `reference_match` | `correctness` | `factuality` |

Notes:

- `riskArea` values are drawn from the suite-manifest `riskArea` enum documented in
  [taxonomy.md §2.1](./taxonomy.md#21-define-the-suite-purpose). `category` is free-text
  row-level taxonomy per [taxonomy.md §1.2](./taxonomy.md#12-classify-the-row-strongly-recommended).
- When a `TestCaseResult` reports several metrics, the adapter uses the first metric with a
  known mapping to set the row's `category`; explicit `metadata.category` on the source row
  always takes priority.
- `eval-ai-library` also ships deterministic and vector metrics (`ExactMatchMetric`,
  `SemanticSimilarityMetric`, `ReferenceMatchMetric`, etc.) and reliability metrics
  (`OutcomeConsistencyMetric`, `LoopDetectionMetric`, ...) not all of which are enumerated
  above; unmapped metric names simply leave `category` unset unless `metadata.category` is
  provided on the source row.
