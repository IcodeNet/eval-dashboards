# Agent checklists

Use these before marking work done or opening a PR.

---

## Schema / model change

- [ ] Types updated in `src/model` (or equivalent)
- [ ] Validation accepts missing optional fields (backward compatible)
- [ ] JSON Schema / exported enums updated if Phase A exists
- [ ] `docs/artifact-format.md` updated
- [ ] At least one example artifact updated or added
- [ ] Tests cover valid + invalid cases
- [ ] No silent rename of existing required fields

## Reporter (especially HTML)

- [ ] Consumes normalized report context, not ad-hoc file parsing
- [ ] All dynamic text escaped
- [ ] Themes still work (default / dark / minimal if present)
- [ ] Taxonomy fields displayed when present; safe when absent
- [ ] Static output works offline (no required external CDN for core function)
- [ ] Fixture or snapshot test if practical

## Gate / check command

- [ ] Config + CLI flags documented
- [ ] Exit codes match project convention
- [ ] Tests for pass / fail / invalid input
- [ ] Suite-manifest thresholds respected when implemented
- [ ] Messages actionable (what failed, what threshold)

## Examples

- [ ] Runnable with documented commands
- [ ] Emit taxonomy-complete artifacts where the example’s purpose is teaching
- [ ] No API keys required for provider-free examples
- [ ] CI smoke path considered (or noted as follow-up)

## Docs-only change

- [ ] Links resolve
- [ ] Naming uses `@icodenet/eval-dashboards` / `eval-dashboards`
- [ ] Proposition / taxonomy language consistent with `PROPOSITION-AND-TAXONOMY.md`
- [ ] STATUS not marked done for unimplemented code

## Before “Phase complete”

- [ ] Success criteria in `PROPOSITION-AND-TAXONOMY.md` for that phase checked
- [ ] MVP slice from `PROPOSITION-REVIEW.md` preferred over extra scope
- [ ] STATUS.md checkboxes match reality
