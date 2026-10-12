# Sandbox gap remediation — 11 October 2026

## Scope and review

This change hardens the existing artifact, gate and local publishing paths. It rejects invalid numeric CLI values and malformed configuration instead of silently dropping policy; validates rate/count thresholds; rejects empty or duplicate scored identities at gates; rejects duplicate discovered run IDs and undeclared suite references; and rejects negative measurements. Duplicate explicit row IDs remain importable and displayable for compatibility, but cannot pass quality gates.

Canonical `usage.costUsd` takes precedence over legacy metadata cost aliases. Tier selection is applied to every run before baseline compatibility, comparison and statistical analysis. Redaction is applied before comparisons/history, removes both tool-argument representations and tool results, and publish preflight inspects current and baseline evidence.

The hook repair accepts only a static JSON tool wrapper or a quoted literal absolute Git directory. It does not evaluate JavaScript, and retains repository, standalone-command and exact staged-evidence checks. Regression tests reject dynamic arguments, alternate repositories, compound commands, bypass flags and missing evidence.

Review covered all changed source, documentation, and regression tests. No changes add a runner, hosted service, network-dependent report or new artifact fields. `eval-report/v1` is retained. Acceptance is intentionally stricter for malformed configurations, orphan suite references, negative measurements, duplicate run IDs and empty/duplicate scored gates. Arbitrary metadata remains supported and is not a general secret-scrubbing contract.

## Verification

The reviewed branch is `codex/sandbox-gap-remediation`, based on current main after PRs #14–#19 were merged. Locked dependencies were refreshed with `pnpm install --frozen-lockfile` (exit 0).

`pnpm check` exited 0: 55 test files and 494 tests passed, TypeScript and build passed, 77 teaching-output lines and 136 documented flags were verified, and all nine commit-hook tests passed.

The staged-tree gate runs `pnpm check`, `pnpm schema:check`, `pnpm verify:cli`, `pnpm verify:package`, `pnpm assets:verify`, and `pnpm audit:ci`. Exact logs, hashes and exit codes are retained in the worktree Git directory's `quality-evidence/`. `pnpm check` includes typechecking, all tests, teaching replay, flag documentation, build and commit-hook regressions. A matching review attestation and `pnpm quality:verify` are required before committing.

The publishing regression invokes the real CLI with `--target=dir --report-dir=report --out-dir=published --redact` against synthetic artifacts in a temporary directory. It checks every published file for synthetic private markers, all four comparison buckets, preserved suite identities, and two-run history. Temporary output is removed after the test. No remote publishing is involved.

No workflow files change. Final PR-head CI raw logs must still be inspected before merge; this document does not claim final CI verification or release completion.

## Remaining work

Starter-template gating, Python monorepo CI wiring, JUnit ingestion, context-preserving teach commands and repeated severity warnings remain outside this change. Assistant-ui integration is deferred.
