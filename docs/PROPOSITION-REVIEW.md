# Proposition Review

**Date:** 2026-08-02  
**Assumes:** `docs/ROADMAP.md`, aligned `docs/STATUS.md`, and `docs/PROPOSITION-AND-TAXONOMY.md` are in the repo; foundation STATUS items are done or in flight.  
**Related:** `docs/PROPOSITION-AND-TAXONOMY.md`, `docs/artifact-format.md`, `docs/ROADMAP.md`

---

## Verdict

**Strong direction, coherent, and differentiated** — but still early and execution-sensitive. The shift from “pretty HTML for any JSON” to “shared schema + taxonomy so reports mean something” is the right product move. It gives a moat that pure visualisers and full platforms both lack. Success depends less on more features and more on **adoption of the taxonomy by a few real runners** and **reports that make incomplete taxonomy obvious**.

| Dimension | Score (subjective) |
|-----------|--------------------|
| Proposition quality | **7.5 / 10** |
| Strength until schema export + taxonomy docs + one real runner path are live | **6 / 10** |

---

## What works well

### 1. Clear, defensible niche

This is not “another eval platform.” It is the **coverage-report layer for agent/LLM evals**: artifact in → insight + gates out. That maps cleanly to how engineering teams already think (NYC/Istanbul, JUnit, SARIF). The proposition document states that crisply.

### 2. Schema + taxonomy as the product

Most competitors either:

- own the full loop (run + store + UI), or  
- accept arbitrary JSON and only chart numbers.

Defining **what a good eval row/suite is** (`kind`, `riskArea`, suite manifests, rubric contracts, baseline compatibility) is higher leverage than another chart. Teams struggle more with *incomparable runs* and *ad-hoc JSON* than with lack of HTML.

### 3. Teaching loop is designed in

`init` samples, taxonomy docs, lint warnings, and a dashboard that surfaces governance are the right teaching mechanisms. Docs alone will not change runner behaviour; **defaults + feedback in CI/UI** will.

### 4. Non-goals are healthy

Staying offline, runner-agnostic, and non-breaking on `eval-report/v1` avoids the usual platform trap. That keeps the story honest for security-conscious and air-gapped teams.

### 5. Phasing is sane

A → B → C (schema → teach → UI/lint) matches how standards actually spread. Doing HTML grouping before the vocabulary is documented would produce pretty but confusing empty states.

---

## Risks and weak spots

### 1. Chicken-and-egg adoption

The taxonomy only pays off if **runners emit it**. Until Vitest/Jest examples and at least one external or internal runner produce taxonomy-complete artifacts, the dashboard will often look sparse and the pitch will feel aspirational.

**Mitigation already in the proposition:** taxonomy-complete `init` fixtures + runner cookbook.

**Still missing as an explicit success metric:** e.g. “N production pipelines emit full suite manifests within 90 days.” Add a concrete adoption target to ROADMAP or the proposition doc.

### 2. Optional fields vs “reports that make sense”

Almost everything taxonomy-related is optional for compatibility. That is correct for a v1 contract, but it undercuts “reports make sense by design.” Soft lint helps; without **opinionated defaults and visible gaps in the UI**, runners will keep emitting minimal `{ id, suite, passed }`.

**Suggestion:** Treat “taxonomy completeness” as a first-class report dimension (e.g. completeness score or badge per suite), not only CLI warnings.

### 3. Overlap with harnesses and platforms

OpenEval, agent-eval, DeepEval, Phoenix, and similar tools will keep shipping their own dashboards. The edge is **portable evidence across tools**, not a prettier single-harness UI. The proposition says this; README and comparison docs must repeat it so people do not evaluate the project as “yet another dashboard.”

### 4. Naming and mental model residual debt

Historical STATUS/PRP mixed `eval-reports` naming. Even with fixes, “eval-dashboards” sounds UI-first; the new proposition is **contract-first**. Consider whether the package description (and maybe a future tagline) should lead with “eval report schema” / “eval taxonomy,” not only “dashboards.”

### 5. Scope creep in Phase C/D

Grouping, lint rules, governance panels, judge reasoning, baseline banners — all valuable, all easy to half-implement. The proposition is large for a small maintainer surface.

**Suggestion:** Define a **minimum lovable taxonomy surface** for the first ship:

- `kind`, `riskArea`, `severity`
- suite `datasetVersion` + `rubricVersion` + `gate.mode`
- judge fields when `kind === 'llm-judge'`
- baseline compatibility banner

Defer exotic risk areas and deep flaky classification until those are solid.

### 6. Schema governance without community yet

Publishing JSON Schema implies a standards-holder role. With a small project, that is fine if versioning is conservative; it is fragile if fields break early. The non-goal “don’t break v1 lightly” must be enforced in practice (additive fields only; new `schemaVersion` for breaks).

### 7. “Teaching runners” is product work, not only docs

Agents implementing Phase B may produce good markdown and weak **examples that people actually copy**. Review criteria for implementation work should include: “Would I paste this into my agent harness today?” — not only “docs exist.”

---

## Strategic fit with prior recommendations

| Prior theme | Proposition fit |
|-------------|-----------------|
| Finish config / init / gates / publish | Still necessary; taxonomy sits *on top* of a working CLI |
| HTML polish | Now correctly framed as *taxonomy visualisation*, not generic charts |
| npm + CI + examples | Critical path for proving the schema is usable |
| Competitive set (agent-eval, OpenEval, goevals, eval-view) | Proposition correctly differentiates; stay ruthless about not becoming a harness |

No major contradiction. The proposition **raises the bar** for what “done” means on HTML and examples: taxonomy-complete, not merely valid JSON.

---

## Recommendations (prioritized)

1. **Ship a minimal taxonomy MVP** (schema export + `taxonomy.md` + complete fixtures + README pitch) before more publish targets or chart libraries.
2. **Add one explicit adoption metric** to the proposition or ROADMAP (e.g. examples + one external emitter).
3. **UI gap signalling** — incomplete taxonomy should be visible in the report, not only in lint logs.
4. **Lead messaging with contract, not chrome** — “shared eval artifact + taxonomy” first; “beautiful dashboards” second.
5. **Keep Phase C thin** — risk area / kind / severity / governance / judge reasoning; cut the rest until usage exists.
6. **Runner checklist as a first-class artifact** — one page “emit this for agent rows / judge rows / deterministic rows” linked from every example.
7. **Revisit package positioning copy** after schema export is real; update npm description and keywords to match the proposition pitch.

---

## Bottom line

The proposition is **right for the problem**: incomparable agent evals and ad-hoc report JSON. It turns the package into infrastructure (schema + vocabulary) rather than a one-off HTML generator, which is the only durable play against both harnesses and SaaS platforms.

It is **not yet proven**. Proof is:

1. A schema that others can validate against without reading the source  
2. Runners that emit taxonomy-complete rows by default  
3. Reports where missing taxonomy is obvious and good taxonomy is rewarding  

Until those three exist, treat `docs/PROPOSITION-AND-TAXONOMY.md` as a **north star for agents and PRs**, not as a claim to put on the homepage without caveats.

---

## Suggested next docs / implementation slice

| Item | Purpose |
|------|---------|
| `docs/taxonomy.md` | Teaching content only (definitions + examples) |
| Schema export (`schemas/eval-report-v1.json` + TS enums) | Phase A |
| Taxonomy-complete `init` fixtures | Phase B |
| Minimal HTML grouping + completeness cues | Phase C MVP |
| One adoption metric on ROADMAP | Accountability |
