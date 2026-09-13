# Docs-site stack decision (Phase 4C closeout)

Date: 2026-09-13

Decision

- Keep the current repo-owned static docs-site (`docs-site/v1/*.html`) as the production documentation surface for the current milestone.
- Keep GitHub Pages as the publish target using the existing Actions workflow.
- Defer migration to VitePress + TypeDoc until API/reference scale or versioning complexity makes manual/static maintenance a measurable bottleneck.
- Keep Docusaurus as a future fallback option only if multi-version docs needs exceed the static-site path.

Why this decision now

- The current static docs-site is already live, versioned, and supports the required adoption flows.
- It preserves offline-first and repo-owned constraints with low operational overhead.
- It avoids introducing a migration tax while Phase 4D execution items (CI outputs, metrics path, Python/interop expansion, calibration, trace hardening) remain higher priority.

Revisit trigger

Re-open this decision when one or more of these are true:

1) API reference pages are repeatedly stale vs source exports.
2) Docs versioning requires concurrent maintenance of multiple active docs versions.
3) Docs update throughput drops due to hand-maintained page duplication.

Exit criteria for a migration proposal

- Prototype proves lower maintenance cost and no regression in static/offline behavior.
- CI build/deploy path remains deterministic and fast.
- Existing docs URLs receive a compatibility map or redirects.
