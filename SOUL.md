# Soul of @icodenet/eval-dashboards

Goal

Make eval quality visible and enforceable for any team, regardless of runner, model provider, or cloud.

What this package is

- Artifact-first reporting and gates for `eval-report/v1`.
- Runner-agnostic: works with existing harnesses.
- Static-first: outputs that are auditable, shareable, and CI-friendly.

What this package is not

- Not a hosted eval platform.
- Not tied to one vendor or one framework.
- Not dashboard chrome without contract discipline.

Principles

- Truth over polish: claims must match code, tests, and live outputs.
- Additive evolution: preserve `eval-report/v1` compatibility unless breakage is unavoidable.
- Evidence density: row-level proof, suite governance, baseline context.
- Operational usefulness: users should know what failed, why, and how to fix it.
- Docs as product: onboarding, API, interoperability, and CI examples must be runnable.

North-star outcomes

- Teams can adopt in one day without replacing their runner.
- CI failures map to row evidence in one hop.
- Reports are decision tools, not screenshots.
- The schema and taxonomy become a shared ecosystem contract.
