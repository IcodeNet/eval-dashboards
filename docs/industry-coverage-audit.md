# Industry Coverage Audit (Suites, Datasets, Rubrics)

Last updated: 2026-09-12

## Why this exists

This audit checks whether our current preset suites, starter datasets, and rubric contracts cover the evaluation areas that are repeatedly emphasized by major industry frameworks and tooling ecosystems.

This is not a schema change proposal by itself. It is a coverage map plus a prioritized backlog.

## Sources reviewed

- Azure AI Evaluation / Foundry evaluator docs (quality, safety, RAG, agentic, tool-call accuracy)
- Promptfoo docs (deterministic, model-graded, context-based, trajectory/tool assertions)
- LangSmith docs (offline/online lifecycle, evaluator types, dataset/versioning practices)
- OWASP GenAI / LLM Top 10 (prompt injection, sensitive disclosure, excessive agency, output handling)
- NIST AI RMF material (govern, map, measure, manage emphasis and trustworthiness posture)

## Current local coverage snapshot

Primary local signals reviewed:

- [docs/suite-presets.md](docs/suite-presets.md)
- [examples/agent-quality-preset/datasets/agent-quality-cases.jsonl](examples/agent-quality-preset/datasets/agent-quality-cases.jsonl)
- [examples/agent-quality-preset/rubrics/agent-quality-rubrics.json](examples/agent-quality-preset/rubrics/agent-quality-rubrics.json)
- [examples/agent-quality-preset/artifacts/run-agent-quality-template.json](examples/agent-quality-preset/artifacts/run-agent-quality-template.json)
- [src/cli/init-scaffold.ts](src/cli/init-scaffold.ts)

## Coverage matrix

Legend:

- `covered`: explicit suite + dataset case + rubric axis/contract guidance
- `partial`: present in docs or examples but missing robust preset-level depth
- `gap`: no meaningful first-class preset guidance yet

| Industry area | Current status | Notes |
|---|---|---|
| Retrieval relevance / recall | covered | `retrieval-recall` preset and starter cases exist. |
| Groundedness / faithfulness | covered | `answer-groundedness` exists; aligns with RAG guidance. |
| Answer quality / relevance | covered | `answer-quality` present with quality axes. |
| Tone of voice | covered | Explicit tone risk area and starter cases included. |
| Factuality / misinformation resistance | covered | `factuality` included in risk areas and quality templates. |
| Refusal safety | covered | `refusal-safety` preset + starter cases included. |
| Content safety categories | partial | High-level `content-safety` exists; category-specific suites (violence/sexual/self-harm/hate) are not first-class presets yet. |
| Prompt injection resilience | covered | `prompt-injection-resilience` exists; should deepen adversarial pattern sets. |
| Tool routing | covered | `mcp-routing` suite exists. |
| Tool-call correctness | covered | `tool-call-accuracy` suite exists. |
| Tool argument correctness | covered | `tool-argument-accuracy` suite exists. |
| Tool execution reliability / retry behavior | covered | `tool-execution-reliability` suite exists. |
| Task completion / goal success | covered | `goal-success` preset and starter dataset/rubric/template coverage added. |
| Intent resolution / task adherence | covered | `intent-resolution` and `task-adherence` presets now included in setup assets. |
| Excessive agency / privilege boundaries | covered | `agency-boundary` preset now covers high-impact confirmation and privilege boundaries. |
| Sensitive info disclosure / PII leakage | covered | `sensitive-disclosure` preset now exists with starter dataset/rubric/template coverage. |
| Improper output handling / schema-safe outputs | partial | Deterministic checks exist generally; no dedicated suite template for output policy/sanitization checks. |
| Prompt/system prompt leakage resilience | gap | No dedicated suite template for leakage attempts. |
| Vector/embedding weakness tests (RAG attack surface) | gap | No dedicated retrieval-security suite template. |
| Unbounded consumption (cost/token/latency abuse) | partial | Reporter can show latency and costs when provided; no preset suite for abuse-budget scenarios and gates. |
| Offline vs online eval loop | partial | Docs discuss history and comparisons; preset guidance still needs explicit online monitoring suite patterns. |
| Multi-turn trajectory quality | covered | `multiturn-trajectory` preset guidance and starter fixture/rubric/template coverage now present. |
| Human calibration and disagreement tracking | covered | `judge-calibration` and rubric/version guidance present. |
| Dataset lifecycle/version governance | covered | Dataset/rubric versioning conventions are documented. |

## Key findings

1. Core quality/RAG/tooling coverage is now strong.
2. Biggest remaining gaps are now security-governance depth areas not yet first-class: prompt leakage, output-handling safety, and category-split content-safety tracks.
3. Safety coverage should split from broad `content-safety` into category-specific tracks to match how major evaluators expose results.
4. Task-level success/adherence coverage now exists and should be stress-tested with deeper real-world datasets.
5. Cost and latency are visible as metrics, but not yet encoded as first-class abuse/consumption test presets.

## Recommended additions (prioritized)

### P0 (completed)

1. Added `goal-success` suite preset.
2. Added `intent-resolution` and `task-adherence` presets.
3. Added `sensitive-disclosure` preset.
4. Added `agency-boundary` preset.

### P1

5. Add `output-handling-safety` preset
   - Purpose: enforce output structure/sanitization expectations for downstream systems.

6. Add `prompt-leakage-resilience` preset
   - Purpose: resist attempts to extract hidden instructions/system prompts.

7. Expand `content-safety` into category suites
   - `safety-violence`, `safety-sexual`, `safety-self-harm`, `safety-hate-unfairness`.

### P2

8. Add `consumption-guardrails` preset
   - Purpose: unbounded token/cost/latency regression detection and abuse resistance.

9. Add `rag-security` preset
   - Purpose: retrieval-layer adversarial and embedding/vector risk scenarios.

## Proposed data/rubric updates for new presets

For each added preset, include:

- dataset starter cases with lifecycle/provenance metadata
- rubric contract axes and `rubricVersion`
- template artifact suite manifest + rows
- scaffold support in `init --preset=agent-quality`

## Verification checklist for future updates

When adding new preset coverage, verify all 5:

1. Preset documented in [docs/suite-presets.md](docs/suite-presets.md)
2. Starter dataset cases added
3. Starter rubrics updated with contracts/axes
4. Template artifact updated with manifest + rows
5. Scaffold generator updated in [src/cli/init-scaffold.ts](src/cli/init-scaffold.ts)

## Bottom line

The project now covers the mainstream quality + RAG + tooling baseline well. The next maturity step is security/governance depth and end-to-end success semantics, aligned to OWASP-style risks and online/offline evaluation loops used in production.
