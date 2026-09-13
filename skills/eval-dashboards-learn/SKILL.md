---
name: eval-dashboards-learn
description: Learn eval-dashboards from concepts to exercises and delivery-stage labs.
version: 0.1.0
author: Byron Thanopoulos (IcodeNet), eval-dashboards maintainers
license: MIT
platforms: [linux, macos, windows]
metadata:
  tags: [evals, learning, onboarding, curriculum, labs, exercises]
  package: "@icodenet/eval-dashboards"
---

# Learn eval-dashboards (Concept-First)

Use this skill when the user asks to learn eval-dashboards end-to-end, train a team, or build onboarding material from fundamentals to operational workflows.

This is a learning skill. It is different from `eval-dashboards-adopt`, which is for wiring an existing repo into eval-report/v1 quickly.

## When to Use

- User asks for a beginner-to-practitioner path.
- User asks for teaching sequence, labs, or exercises.
- User asks "what should I read first" before commands.

Do not use for: direct integration-only work in an existing repo with no training goal (use `eval-dashboards-adopt`).

## Learning Path (in order)

1) Conceptual pre-read (before any commands)
- https://icodenet.github.io/langfuse-101/
- Why first: establishes evals as a continuous operating model (live evidence -> review -> datasets/versioning -> experiments -> release gates).

2) Main curriculum map
- `docs/teach-curriculum.md`
- Rule: read each stage in this order: Concept -> Why this matters -> Practice.

3) Hands-on exercises (core build-up)
- `docs/teach-exercises/01-foundations.md`
- `docs/teach-exercises/02-artifact-first.md`
- `docs/teach-exercises/03-first-synthetic-dataset.md`
- `docs/teach-exercises/04-row-taxonomy.md`
- `docs/teach-exercises/05-suite-taxonomy.md`
- `docs/teach-exercises/06-live-agent-evidence.md`
- `docs/teach-exercises/07-judge-calibration.md`
- `docs/teach-exercises/08-gates-release.md`
- `docs/teach-exercises/09-reports-history.md`
- `docs/teach-exercises/10-iteration-loop.md`

4) Delivery-stage labs (operations)
- `docs/teach-labs/README.md`
- `docs/teach-labs/01-local-dev-loop.md`
- `docs/teach-labs/02-pre-pr-gating.md`
- `docs/teach-labs/03-pr-review-triage.md`
- `docs/teach-labs/04-release-readiness.md`
- `docs/teach-labs/05-post-release-monitoring.md`
- `docs/teach-labs/fde-role-workflow.md`

## Delivery Rules

- Keep language simple and concrete.
- Introduce concept before commands.
- Never skip "why this matters".
- Keep exercises artifact-first and runner-agnostic.
- Require evidence outputs, not narrative claims.

## Completion Criteria (for learner)

A learner is complete when they can:

- Explain eval-report/v1 and why runner-agnostic artifacts matter.
- Produce a valid artifact and run `lint`, `check`, and `report` in order.
- Interpret history/progress/gate/row-level evidence.
- Make a pre-PR and release decision from artifacts.
- Run a post-release monitoring loop.
- Explain the FDE artifact-first operating loop.

## Pitfalls

- Starting with commands before conceptual grounding.
- Treating one run as proof instead of trend evidence.
- Ignoring baseline/version context when comparing runs.
- Teaching platform-coupled specifics as if they are package requirements.

## Verification

- Confirm learner completes exercises in order and meets each file's definition of done.
- Confirm learner can produce and explain all four evidence classes:
  - history
  - progress
  - gate decision
  - row-level detail analysis
