# Sandbox gap remediation — 11 October 2026

Eleven reproduced sandbox gaps have local fixes in this checkout. The independent second coding-model trial used GPT-6 Astra.

[Full remediation record and evidence in Codex storage](/Users/byronth/.codex/visualizations/2026/10/11/01a12b10-f714-7953-a07a-5b000cfaa9fe/remediation.md)

The fixes cover fail-closed configuration/numeric policies, duplicate case and run identities, undeclared suites, empty evidence, negative measurements, canonical usage cost budgets, tier-scoped comparisons, and tool/comparison redaction on publishing. Duplicate explicit IDs remain importable for compatibility, but cannot pass quality gates.

Validation in the original checkout: `pnpm check` passed (494 tests, typechecking, teaching and flag documentation checks, build, commit-evidence tests). Release assets regenerated and verified unchanged. Saved sandbox controls reproduced the corrected exit codes. Publishing tests use synthetic markers and local directory output; no remote publication or hosted CI is claimed.

Commit preparation uses a separate `codex/sandbox-gap-fixes` branch based on current `origin/main`, preserving the original checkout's staged LangSmith changes. The commit gate records exact logs and exit codes for `pnpm check`, `pnpm schema:check`, `pnpm verify:cli`, `pnpm verify:package`, `pnpm assets:verify`, and `pnpm audit:ci` under the worktree Git directory's `quality-evidence/`. No workflow files change, so changed-workflow raw CI log review does not apply.

Review covers changed source and regression tests. The public redaction profile covers named evidence fields and tool arguments/results; arbitrary metadata is not a general secret-scrubbing contract. Validation intentionally tightens acceptance of orphan suite references, invalid measurements, duplicate run IDs, and empty/duplicate scored gates. Imported duplicate explicit IDs remain displayable.

Earlier onboarding gaps remain open: starter-template gating, Python monorepo CI wiring, JUnit ingestion, context-preserving teach commands, and repeated severity warnings. These local results do not claim a released package.

The authorized hook repair decodes one static JSON tool wrapper and uses its literal working directory, retaining the standalone-command, repository, and staged-evidence checks. `node --test scripts/commit-evidence.test.mjs` passes all nine tests, including alternate repositories, dynamic arguments, compound commands, bypass flags, and missing evidence. The focused main-based branch passes 493 application tests; the original checkout has one additional LangSmith test.

The observed tool bridge emits Bash input containing only the command and the chat directory, omitting the requested tool workdir. A standalone command can therefore name its effective Git directory with a quoted absolute `-C` argument; the hook verifies that target against its source repository. Tests exercise the omitted-workdir bridge and reject other targets, substitutions, relative paths, bypass flags, compound commands, and missing review evidence.
