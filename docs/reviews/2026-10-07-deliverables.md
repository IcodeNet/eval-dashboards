# Deliverable verification — 2026-10-07

This record distinguishes checks that ran locally from checks that remain
blocked or have not run remotely. It does not claim that uncommitted changes
have passed GitHub Actions.

## Verified locally

- `pnpm check` under Node 22 exited 0. It ran typechecking, documentation flag
  verification, a production build, 52 Vitest files with 435 tests, and seven
  commit-evidence tests.
- `pnpm schema:check` exited 0 with no generated-schema difference.
- `pnpm verify:cli` exited 0 with 107 passing CLI cases and no failures.
- `pnpm verify:package` exited 0 under Node 22. It packed the repository,
  installed the tarball in an isolated consumer, compiled imports of the
  public types, exercised runtime and schema exports, and invoked CLI help.
- `pnpm release:prepare` exited 0 after running the full check plus a fresh
  byte-for-byte regeneration of the tracked release-asset files.
- The built CLI imported the same two-row OpenAI Evals fixture through
  `openai-evals`, `oaieval`, `oaievals`, and `openai-eval`. Each alias passed a
  0.5 pass-rate gate and failed a 1.0 pass-rate gate as expected.
- The Codex `PreToolUse` command rejected a commit against the current tree,
  which has no matching successful check and review record. The installed
  Lefthook pre-commit script also exited 1 for that tree. No commit was made.

The dated assertions above were taken from actual command output retained in
the local verification archive at `.tmp/verification/2026-10-07/`. That
directory is ignored working material; this file is the durable reviewed
summary.

## Review findings resolved during verification

- The OpenAI Evals guide described an unsupported `score_model` event. The
  guide now limits accepted native events to the structures handled by the
  importer and distinguishes local JSON/JSONL exports from arbitrary hosted
  API responses.
- The Vitest 4 upgrade exposed a non-constructable arrow-function mock. The
  publish test now uses a constructable mock and passes in the full suite.
- The first packed-consumer invocation treated a file path as an input
  directory. The verifier now creates and passes an isolated directory.
- A failed assistant-ui eval invocation could leave an older successful
  dashboard artifact in place. The CLI now removes only its own latest output
  before validation, and a subprocess regression test proves the stale file is
  gone after a configuration failure.
- A Lefthook command entry could be skipped when Git had no staged paths. The
  gate is now a pre-commit script and a direct installed-hook run proves that it
  rejects missing or stale evidence.
- Release-asset verification compared generated assets with `HEAD`, so a release
  PR that intentionally refreshed assets could never pass before commit. It now
  snapshots the candidate files, regenerates them, and fails only when those
  candidate bytes were stale. A clean-runner reproduction with the ignored
  `eval-report/` directory initially absent reproduced all nine tracked files.
- Public documentation contained machine-specific checkout paths. Those paths
  were removed from the package candidate.

## Release audit resolution

- `pnpm why braces --recursive` showed that `braces@3.0.3` came only through
  the legacy Semantic Release dependencies. The supported release already uses
  GitHub OIDC trusted publishing, so the duplicate token-based workflow,
  configuration, scripts, and dependencies were removed.
- After the cleanup, `pnpm audit:ci` exited 0 with two moderate and one low
  finding. The high-severity threshold was not changed. The cleanup removed 217
  packages from the installed graph.

## Remaining limitations and blockers

- PR run `37681624594` reached the new release-asset step, then failed because
  the first verifier revision tried to scan ignored `eval-report/` before it
  existed on the clean runner. Its raw failed log was inspected. The follow-up
  verifier hashes only Git-tracked candidate assets and passes the same missing-
  directory reproduction locally; that follow-up had not run remotely when
  this record was written.
- No passing commit-evidence receipt had been created when this durable review
  record was written. Staging and the exact-tree evidence run follow this
  review; `pnpm quality:verify` remains the authoritative receipt check.
- The assistant-ui dashboard smoke run is synthetic. It proves adapter, gate,
  report, and escaping behavior; it is not evidence of agent-model quality.
- Codex hook trust remains a user action through `/hooks`. Local hooks can be
  removed or bypassed by a developer and do not replace protected-branch CI.

## Evidence anchors

- Required checks and staged-tree validation are implemented in
  `scripts/commit-evidence.mjs` and covered by
  `scripts/commit-evidence.test.mjs`.
- The packed consumer is implemented in `scripts/verify-packed-package.mjs`
  and is included in `.github/workflows/ci.yml`.
- OpenAI Evals aliases are registered in `src/cli/import-adapters.ts` and
  exercised in `test/import-adapters-openai-evals.test.ts`.
- OTel request and response identifiers are mapped in
  `src/cli/import-adapters.ts`, tested in
  `test/import-adapters-otel-genai.test.ts`, and documented in
  `docs/integrations/otel-genai.md`.
