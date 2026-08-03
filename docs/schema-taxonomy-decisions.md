# Schema, Preset, and Documentation Decision Rules

`eval-report/v1` is the shared contract that runners emit and this package validates, gates, compares, and renders. Suite presets are setup guidance for common agent-quality programs. This page records which concepts belong in each layer so the schema stays portable while the setup experience gets more opinionated.

## Decision Table

| Concept | Layer | Why |
|---|---|---|
| `schemaVersion`, `run`, `suites`, `rows` | `eval-report/v1` schema | Every runner needs these fields for validation, reporting, history, and gates. |
| Row identity, suite name, pass/fail, severity, category, evidence fields | `eval-report/v1` schema | These are portable across deterministic checks, agent traces, LLM judges, and human review. |
| `suiteManifests`, `rubricContracts`, `datasetChangelog` | Optional `eval-report/v1` schema fields | These governance concepts are portable, but not every runner can provide them on day one. |
| Risk areas, row kinds, targets, dataset sources, grader kinds | Schema enums | The renderer and lint rules need stable vocabulary for grouping and warnings. Keep additions broad and runner-agnostic. |
| `retrieval-recall`, `answer-groundedness`, `answer-quality`, `refusal-safety`, `prompt-injection-resilience`, `mcp-routing`, `content-coverage`, `regression-incidents`, `judge-calibration` | Preset suite names | These are useful defaults for agent-quality setup, but product teams may rename, split, or merge them. Do not require them in `eval-report/v1`. |
| Dataset file layout, JSONL starter cases, rubric templates, CI tiers | Preset files and examples | These accelerate adoption without forcing every runner or domain into the same storage format. |
| Threshold recommendations, gate mode recommendations, lifecycle examples | Documentation and examples | Defaults are useful teaching material, but teams need to tune them by risk and cost. |
| Product-specific case contracts such as Ask Byron golden cases | Host application | Local datasets contain product semantics, expected source files, and domain categories that should not leak into the shared package contract. |
| Artifact assembly mechanics such as suite totals, validation, output cleanup, and row mapping callbacks | Public adapter helpers | These mechanics are portable and reduce drift, while preserving project-specific row mapping in the host application. |

## Additive Schema Rules

Add a schema field when all of these are true:

1. At least two integrations need the same concept.
2. The concept affects validation, gates, comparison, history, or rendering.
3. The field can be optional in `eval-report/v1` without weakening existing artifacts.
4. The field name is domain-neutral.

Keep a concept in presets or docs when any of these are true:

1. The concept is mainly onboarding guidance.
2. The name is domain-specific or suite-specific.
3. The value is likely to vary by product, evaluator, cost model, or regulatory environment.
4. The renderer can work without it.

## Breaking Change Rule

Do not remove, rename, or narrow existing `eval-report/v1` fields in place. If a breaking change becomes unavoidable, introduce a new schema version and publish migration notes. Until then, prefer additive optional fields plus lint rules that teach completeness.

## Current Decisions

- Suite presets remain setup guidance, not schema-required suite ids.
- Runner adapter helpers own repeatable artifact mechanics, not product-specific dataset contracts.
- Ask Byron integration lessons can graduate into presets, examples, lint rules, or adapter helpers, but not into hard-coded schema semantics unless another integration proves the same need.
- `eval-report/v1` remains additive through the current setup-layer work.
