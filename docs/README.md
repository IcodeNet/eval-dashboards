# Docs index

`docs/` has grown large (94 files, 29 top-level) with no single entry point.
This index groups every doc by audience so you can find what you need
without reading `teach-curriculum.md` or any other single file first.

**Canonical surface:** raw `docs/*.md` in this directory is the source of
truth. The [published docs site](https://icodenet.github.io/eval-dashboards/docs/)
is built from these files, so the two cannot disagree. The earlier
hand-written pages are in [`docs-site/public/v1/`](../docs-site/public/v1/index.html).

## Start here

- [artifact-format.md](./artifact-format.md) — the `eval-report/v1` JSON contract, field by field
- [taxonomy.md](./taxonomy.md) — what makes a report "complete"; definitions, examples, checklist
- [configuration.md](./configuration.md) — all config file options

## Contract & schema

- [artifact-format.md](./artifact-format.md)
- [taxonomy.md](./taxonomy.md)
- [schema-taxonomy-decisions.md](./schema-taxonomy-decisions.md) — which concepts become schema fields vs. docs/examples
- [judge-axis-rubric-scales.md](./judge-axis-rubric-scales.md) — LLM-judge axis scoring conventions
- [suite-presets.md](./suite-presets.md) — built-in agent-quality suite presets
- [benchmark-packs.md](./benchmark-packs.md) — versioned safety/tool-routing/groundedness suite bundles

## CI & governance

- [gates.md](./gates.md) — quality gates and CI integration
- [publishing.md](./publishing.md) — GitHub Pages, Azure, custom publish targets
- [github-approval-gate-pattern.md](./github-approval-gate-pattern.md) — reviewer approvals + commit-status gating
- [REPO-HARDENING.md](./REPO-HARDENING.md) — sign/verify, waivers, heartbeat, bypass tracking
- [npm-publishing.md](./npm-publishing.md) — package release workflow

## Teaching

- [teach-curriculum.md](./teach-curriculum.md) — novice path from synthetic dataset to gates/history
- [teach-exercises/](./teach-exercises/README.md) — foundational, hands-on exercises (01–11, plus PM-focused pm-01/pm-02)
- [teach-labs/](./teach-labs/README.md) — delivery-stage workflow labs (local dev loop through post-release monitoring, FDE role workflow)

## Product & roadmap

- [Hosted platform requirements](./hosted-platform-requirements.md) — approved scope, gaps, architecture, and delivery acceptance
- [PROPOSITION-AND-TAXONOMY.md](./PROPOSITION-AND-TAXONOMY.md) — product north star
- [PROPOSITION-REVIEW.md](./PROPOSITION-REVIEW.md) — risks and MVP slice
- [PRP.md](./PRP.md) — original product requirements
- [STATUS.md](./STATUS.md) — done vs. remaining, honest completion ledger
- [ROADMAP.md](./ROADMAP.md) — prioritized phases and plan
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system/module structure
- [industry-coverage-audit.md](./industry-coverage-audit.md) — external-source suite/dataset/rubric coverage mapping
- [docs-site-stack-decision.md](./docs-site-stack-decision.md) — docs-site stack decision record
- [comparison-with-nyc.md](./comparison-with-nyc.md) — comparison with NYC/Istanbul (code coverage)
- [adoption-map.md](./adoption-map.md) — candidate existing-runner adoption map
- [adoption-feedback-loop.md](./adoption-feedback-loop.md) — weekly page-to-action checks and cadence signals
- [adoption-friction-backlog.md](./adoption-friction-backlog.md) — documentation blockers, owner/severity/next action
- [adoption-metrics/](./adoption-metrics/latest.json) — adoption metrics snapshots and manual signal tracker
- [community-partnership-log.md](./community-partnership-log.md) — partnership log and outreach stages
- [onboarding-runbook.md](./onboarding-runbook.md) — new-adopter onboarding steps
- [reviews/](./reviews/2026-09-14-teaching-curriculum-review.md) — dated review notes

## Integrations

- [integrations/README.md](./integrations/README.md) — index of "works with" guides
- [integrations/promptfoo.md](./integrations/promptfoo.md)
- [integrations/deepeval.md](./integrations/deepeval.md)
- [integrations/openevals-agentevals.md](./integrations/openevals-agentevals.md)
- [integrations/anthropic-eval-methodology.md](./integrations/anthropic-eval-methodology.md)
- [integrations/langfuse.md](./integrations/langfuse.md)
- [integrations/wandb-weave.md](./integrations/wandb-weave.md)
- [integrations/arize-phoenix.md](./integrations/arize-phoenix.md)
- [integrations/braintrust.md](./integrations/braintrust.md)
- [integrations/ragas.md](./integrations/ragas.md)
- [integrations/trulens.md](./integrations/trulens.md)
- [integrations/patronus.md](./integrations/patronus.md)
- [integrations/trace-stacks.md](./integrations/trace-stacks.md)
- [integrations/risk-register.md](./integrations/risk-register.md) — runtime/version drift, schema drift, cloud coupling risks

## Reference

- [cli-help/](./cli-help/README.md) — exact `--help` snapshots tracked for truth-sync
- [reporters.md](./reporters.md) — HTML, text, Markdown, JSON reporters
- [history-storage.md](./history-storage.md) — choose the JSON or SQLite history store and convert between them
- [faq.md](./faq.md) — what it does and does not do, platforms, network use, upgrades
- [examples.md](./examples.md) — runnable example index
- [case-studies/assistant-ui/README.md](./case-studies/assistant-ui/README.md) — first real external-repo adoption case study
