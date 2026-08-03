# Product Proposition: Schema + Taxonomy First

**Status:** Proposal — implement after foundation items in `STATUS.md` / `ROADMAP.md`  
**Audience:** Maintainers and coding agents implementing the next product layer  
**Related:** `docs/artifact-format.md`, `docs/PRP.md`, `docs/ROADMAP.md`, `docs/STATUS.md`

---

## 1. Goal

Shift the product from:

> “Generate HTML dashboards and gates from whatever JSON you emit”

to:

> **“Define the standard artifact schema and eval taxonomy so every runner speaks the same language — and reports, gates, and history are meaningful by design.”**

Runners emit `eval-report/v1` using a shared vocabulary. This package is the dictionary, style guide, and reporting layer (NYC/Istanbul mental model for agent/LLM evals).

---

## 2. Value proposition (copy for README / marketing)

### One-liner

**The Istanbul of agent evals:** a shared artifact schema and taxonomy so every runner produces reports that actually mean something.

### Short pitch

`@icodenet/eval-dashboards` defines a versioned artifact format and a practical taxonomy for agent and LLM evaluations (`kind`, risk areas, suite manifests, rubric contracts, severity, baseline compatibility).

Emit that JSON from any runner. Get themeable static dashboards, quality gates, history, and publishing — with no platform lock-in.

Inspired by NYC/Istanbul for coverage: runners produce data; this package turns a shared vocabulary into insight and CI gates.

### Positioning

| Category | Examples | Our angle |
|----------|----------|-----------|
| Full platforms | Phoenix, Opik, LangSmith | Offline, artifact-first, no lock-in |
| Harnesses | OpenEval, agent-eval, Inspect | We do not run evals; we standardise what they **emit** |
| Pure visualisers | goevals, ad-hoc HTML | We define the schema **and** the meaning of the fields |
| CI gates only | llm-eval-gate, custom scripts | Gates **plus** taxonomy-aware history and dashboards |

**Promise to runner authors:** If you emit `eval-report/v1` with the taxonomy filled in, any team gets the same reports, gates, and trends without inventing their own JSON shape.

**Promise to teams:** Vitest, Python agent runners, and CI jobs speak the same language. Comparisons and gates stay meaningful when datasets and rubrics change.

---

## 3. Taxonomy to teach (must be documented and enforced)

These concepts already exist in `eval-report/v1`. They must become first-class product surface, not buried types.

### 3.1 Row-level

| Field / concept | Purpose | Teaching note |
|-----------------|---------|---------------|
| `kind` | `deterministic` \| `agent` \| `llm-judge` \| `human-review` | Different evidence types; reports treat them differently |
| `passed` / `score` | Outcome | Always required for gate math |
| `severity` | `none` \| `low` \| `medium` \| `high` \| `critical` | Failure priority for gates and UI |
| `category` / `reason` | Failure taxonomy | Machine + human readable failure class |
| `input` / `output` / `expected` | Evidence | Escaped in HTML; optional by kind |
| `turns` / `toolCalls` | Agent behaviour | First-class for `kind: agent` |
| `axisScores` | Rubric axes | Pair with rubric contracts |
| `judgeModel` / `judgeVerdict` / `judgeCategory` / `judgeReasoning` | LLM judge evidence | Required teaching for `llm-judge` rows |
| `datasetId` / `scenarioId` / `rubricId` / `rubricVariant` | Stable IDs | Trend and baseline grouping |
| `promptVersion` / `agentChannel` / `agentVersion` | Subject under test | Versioning of what was evaluated |
| `groundTruth*` | Calibration | For judge-eval suites |

### 3.2 Suite-level (SuiteManifest)

| Field | Purpose |
|-------|---------|
| `target` | `agent` \| `conversation` \| `judge` \| `custom` |
| `datasetSource` / `datasetVersion` | Provenance and comparability |
| `rubricVersion` | Rubric drift detection |
| `riskArea` | Why the suite exists: `compliance`, `pii`, `prompt-safety`, `response-quality`, `tool-use`, `tool-routing`, `groundedness`, `relevance`, `custom`, … |
| `graders` | How scored: deterministic, human-labelled, llm-judge, tool-call-check, custom |
| `gate` | `mode: blocking \| report-only` + thresholds |

### 3.3 Cross-run

| Concept | Purpose |
|---------|---------|
| Baseline compatibility | `compatible` \| `warning` \| `blocked` when dataset/rubric versions drift |
| History / trends | Pass rate and failures over time **by** risk area, suite, kind |
| New failures / persistent failures / flaky | Gate inputs that depend on stable row identity + taxonomy |

---

## 4. Implementation work (for a coding agent)

Implement in phases. Prefer small PRs. Do not invent a new schema version unless necessary; extend docs, exports, lint, and UI first.

### Phase A — Schema as product

1. **Export schema surface**
   - Publish JSON Schema for `eval-report/v1` (e.g. under `schemas/eval-report-v1.json` or package export path).
   - Export TypeScript types + const enums for taxonomy values (`kind`, `riskArea`, `severity`, graders, etc.).
   - Document optional `$schema` URL field (or top-level convention) pointing at the published schema.

2. **Versioning policy**
   - Document in `docs/artifact-format.md` (or new `docs/schema-versioning.md`): when fields may be added, when a new `schemaVersion` is required, how consumers should ignore unknown fields.

3. **Acceptance**
   - Schema file validates example artifacts under `examples/`.
   - Types are importable from the package without pulling the full CLI.

### Phase B — Teach the taxonomy

1. **`docs/taxonomy.md`**
   - Definitions for every taxonomy concept in §3.
   - When to use each `kind` and `riskArea`.
   - Good vs bad example rows (minimal valid vs taxonomy-complete).
   - How suite manifests and rubric contracts make comparisons meaningful.

2. **README**
   - Short “Taxonomy” section linking to `docs/taxonomy.md`.
   - Update the pitch to the one-liner / short pitch in §2.
   - Keep NYC analogy; stress schema + vocabulary, not only HTML.

3. **`eval-dashboards init`**
   - Generate config **and** 2–3 example artifacts that demonstrate:
     - deterministic suite
     - agent / tool-use suite (with `toolCalls` or tool-routing risk area)
     - llm-judge (or judge-calibration) suite with judge fields + rubric axes
   - Comments or companion markdown explaining why fields are set.

4. **Runner cookbook**
   - Extend or add docs (e.g. `docs/emitting-artifacts.md`):
     - How to emit `eval-report/v1` from Vitest / Jest / plain Node / Python sketch.
     - Checklist of taxonomy fields runners should fill for each `kind`.

5. **Acceptance**
   - New contributor can read taxonomy doc + one example and produce a complete artifact without reverse-engineering types.
   - `init` output is valid and taxonomy-complete by default.

### Phase C — Taxonomy-aware reports and gates

1. **HTML dashboard**
   - Group / filter by `riskArea`, `kind`, `severity`, `datasetId`, `rubricId` where data exists.
   - Suite governance panel: dataset/rubric versions, gate mode, risk area.
   - Baseline compatibility banner on latest-vs-previous.
   - For `llm-judge` / agent rows: show `judgeReasoning`, axis scores, tool calls when present.
   - Empty states that nudge missing taxonomy (“No risk area set — see taxonomy docs”).

2. **Optional `eval-dashboards lint` (or `check --lint-taxonomy`)**
   - Structural schema validation (already partially present).
   - Soft warnings (configurable strictness):
     - suite missing `riskArea` or `datasetVersion`
     - `kind: llm-judge` missing `judgeReasoning` / `judgeModel`
     - `kind: agent` with no `toolCalls` and no agent version metadata
     - blocking suite with rubric/dataset change without compatibility path
   - Exit codes consistent with existing CLI conventions.

3. **Gates**
   - Enforce suite-manifest thresholds (already on STATUS remaining list).
   - Prefer gates expressed in taxonomy terms (severity, risk area, new failures) in docs and examples.

4. **Acceptance**
   - Demo artifact with full taxonomy renders grouped, readable HTML without custom CSS hacks.
   - Lint warns on incomplete taxonomy; CI can opt into fail-on-warning later.

### Phase D — Adoption assets

1. Update comparison doc (`docs/comparison-with-nyc.md`) to mention schema/taxonomy, not only CLI parity.
2. Changelog entry describing schema export + taxonomy docs as product features.
3. Keywords / npm description mention “eval taxonomy”, “eval-report schema”, “quality gates”.

---

## 5. Non-goals (for this initiative)

- Building a hosted eval platform or requiring sign-up.
- Replacing agent harnesses (Claude Code, Inspect, etc.); only standardising their **output**.
- Forcing every field on every row — taxonomy fields stay optional, but **documented and encouraged**, with lint for completeness.
- Breaking `eval-report/v1` without a versioned migration path.

---

## 6. Success criteria

- [ ] JSON Schema (and TS enums) are published and used by examples.
- [ ] `docs/taxonomy.md` exists and is linked from README.
- [ ] `init` produces taxonomy-complete sample artifacts.
- [ ] HTML report groups/surfaces risk area, kind, severity, suite governance, judge evidence.
- [ ] Optional taxonomy lint exists and is documented for CI.
- [ ] README pitch matches §2 (schema + taxonomy first, dashboard as proof).

---

## 7. Suggested agent prompt (copy-paste later)

```text
Read docs/PROPOSITION-AND-TAXONOMY.md, docs/artifact-format.md, docs/STATUS.md, and docs/ROADMAP.md.

Implement Phase A and Phase B first:
1. Export JSON Schema + TS taxonomy enums for eval-report/v1.
2. Add docs/taxonomy.md and update the README pitch/section.
3. Extend `eval-dashboards init` to emit taxonomy-complete example artifacts.
4. Add docs for emitting artifacts from runners (checklist by kind).

Do not break existing CLI behaviour. Keep schemaVersion as eval-report/v1 unless a breaking change is unavoidable. Follow existing code style and tests; add tests for schema validation against examples/.
```

Then a follow-up prompt for Phase C (HTML + lint).

---

## 8. File placement

Recommended path in the repo:

```text
docs/PROPOSITION-AND-TAXONOMY.md
```

Optional later splits if the doc grows:

- `docs/taxonomy.md` (teaching content only)
- `docs/schema-versioning.md`
- `schemas/eval-report-v1.json`
