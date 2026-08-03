# Agent prompts — copy-paste task briefs

Use these with a coding agent after it has read `AGENTS.md` and the linked docs.

---

## 1. Schema export (Phase A)

```text
Read AGENTS.md, docs/PROPOSITION-AND-TAXONOMY.md Phase A, and docs/artifact-format.md.

Export eval-report/v1 as a product surface:
1. Add a JSON Schema file (e.g. schemas/eval-report-v1.json) that validates existing examples under examples/.
2. Export TypeScript types and const enums for taxonomy values (kind, riskArea, severity, graders, gate mode, etc.) from a stable package path.
3. Document schema versioning policy (additive optional fields vs new schemaVersion) in docs (artifact-format.md or schema-versioning.md).
4. Ensure example artifacts still validate; add tests that load examples against the schema/validator.

Do not break existing CLI behaviour. Prefer additive changes only.
```

---

## 2. Taxonomy docs + README pitch (Phase B docs)

```text
Read AGENTS.md, docs/PROPOSITION-AND-TAXONOMY.md §2–3, and docs/PROPOSITION-REVIEW.md.

1. Create docs/taxonomy.md explaining kind, riskArea, severity, suite manifests, rubric contracts, baseline compatibility, with good vs bad examples.
2. Update README with the schema+taxonomy pitch (not dashboard-first only) and link to taxonomy.md and artifact-format.md.
3. Keep the NYC/Istanbul analogy; stress portable vocabulary across runners.

No code changes required unless links/scripts need updating.
```

---

## 3. Taxonomy-complete init fixtures (Phase B)

```text
Read AGENTS.md, docs/taxonomy.md (if present), docs/artifact-format.md, and existing init/example code.

Extend eval-dashboards init (or example fixtures) so generated samples are taxonomy-complete:
- one deterministic suite
- one agent/tool-use suite (riskArea tool-use or tool-routing, toolCalls or equivalent)
- one llm-judge suite with judgeModel, judgeReasoning, axisScores where applicable
Include suite manifests with datasetVersion, rubricVersion, gate.mode.

Validate with existing model validation and tests. Update STATUS only if fully done.
```

---

## 4. Runner emission cookbook

```text
Read AGENTS.md, docs/artifact-format.md, docs/taxonomy.md, and examples/vitest-evals or examples/llm-agent-evals.

Add docs/emitting-artifacts.md (or expand docs/examples.md) with:
- minimal valid artifact vs taxonomy-complete checklist by kind
- short recipes for Vitest, Jest, and plain Node (and a Python sketch if space)
- stable id guidance for trend/gate comparison

Point examples at this doc. Do not invent a new schema version.
```

---

## 5. HTML taxonomy MVP (Phase C thin slice)

```text
Read AGENTS.md, docs/PROPOSITION-REVIEW.md (minimum lovable taxonomy surface), and src/reporters HTML code.

Improve the HTML reporter to surface taxonomy when present:
- group or filter cues for kind, riskArea, severity
- suite governance: dataset/rubric versions, gate mode, riskArea
- baseline compatibility banner when comparison exists
- judgeReasoning / axisScores for llm-judge rows
- empty/missing taxonomy cues that point at docs/taxonomy.md

Keep static, themeable, no mandatory server. Escape all dynamic text. Add tests if reporter logic is unit-testable; otherwise snapshot or fixture-based checks.
```

---

## 6. Taxonomy lint

```text
Read AGENTS.md and docs/PROPOSITION-AND-TAXONOMY.md Phase C lint section.

Add optional taxonomy lint (eval-dashboards lint or check --lint-taxonomy):
- warn on missing riskArea / datasetVersion on suites
- warn on llm-judge rows missing judgeReasoning or judgeModel
- warn on agent rows missing useful agent metadata when kind is agent
Keep configurable strictness; default to warnings. Document exit codes. Tests for warn vs pass cases.
```

---

## 7. Finish a single STATUS remaining item

```text
Read AGENTS.md and docs/STATUS.md.

Implement exactly one Remaining item: "<PASTE ITEM HERE>".
Match existing patterns in src/. Add tests. Update docs if the user-facing CLI or config changes.
Mark the STATUS checkbox only if code and tests are complete. Do not start other Remaining items.
```

---

## 8. Align naming drift

```text
Search the repo for residual "eval-reports" / "@icodenet/eval-reports" naming in docs and comments.
Align to eval-dashboards / @icodenet/eval-dashboards where it refers to this package.
Do not rewrite git history. Do not rename the npm package unless explicitly asked.
```
