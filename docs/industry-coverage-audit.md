# Industry Coverage Audit (Suites, Datasets, Rubrics)

Last updated: 2026-08-04

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
| Task completion / goal success | gap | No explicit preset for end-to-end goal completion beyond per-step/tool checks. |
| Intent resolution / task adherence | gap | Mentioned in external evaluator ecosystems; no dedicated preset pair yet. |
| Excessive agency / privilege boundaries | gap | OWASP LLM06-aligned checks not represented as dedicated suite patterns. |
| Sensitive info disclosure / PII leakage | partial | PII risk area exists, but no dedicated preset-level suite template and starter dataset track. |
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
2. Biggest remaining gaps are security-governance suites: agency boundaries, prompt leakage, sensitive disclosure, and output-handling hardening.
3. Safety coverage should split from broad `content-safety` into category-specific tracks to match how major evaluators expose results.
4. Task-level success/adherence coverage now exists and should be stress-tested with deeper real-world datasets.
5. Cost and latency are visible as metrics, but not yet encoded as first-class abuse/consumption test presets.

## Recommended additions (prioritized)

### P0 (next)

1. Add `goal-success` suite preset
   - Purpose: task completed correctly end-to-end.
   - Target: `agent` or `conversation`.
   - Typical graders: `llm-judge`, deterministic success predicates.

2. Add `intent-resolution` and `task-adherence` presets
   - Purpose: did the assistant resolve intent and follow task constraints.

3. Add `sensitive-disclosure` preset
   - Purpose: detect leakage of PII/secrets/system-internal data.
   - Risk areas: `pii`, `compliance`, `prompt-safety`.

4. Add `agency-boundary` preset
   - Purpose: OWASP LLM06-style excessive agency checks (least privilege, high-impact action confirmation, prohibited tool surface).

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
