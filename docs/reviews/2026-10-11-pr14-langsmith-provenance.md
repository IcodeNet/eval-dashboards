# PR #14 LangSmith provenance review

Date: 2026-10-11  
Pull request: <https://github.com/IcodeNet/eval-dashboards/pull/14>

## Scope reviewed

The change imports LangSmith typed addresses and revision identifiers as row metadata. Run-specific `id` remains the preferred row identity, with the existing deterministic suite-and-index fallback when it is absent.

## Finding and resolution

CodeRabbit identified that LangSmith addresses describe shared destinations or query targets rather than individual runs. The original change used `address` as a row-id fallback, so two runs sharing an address could receive the same `suite:id` key and corrupt comparison or adjudication selection.

Resolved by:

- removing `address` from row identity selection;
- preserving it as `metadata.langsmithAddress`;
- preserving `revision_id` and `revisionId` as `metadata.langsmithRevisionId`;
- adding a regression with two address-only rows that share one typed address and retain distinct fallback IDs;
- correcting the integration guide and roadmap claim.

No unresolved local review findings remained after this change.

Final-head CodeRabbit review also found that an empty `revision_id` could hide a non-empty `revisionId`. The importer now selects the first non-empty revision alias consistently, and the shared-address regression includes an empty snake-case alias alongside a populated camel-case alias.

## Verification

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm exec vitest run test/import-adapters-langsmith.test.ts` | 0 | 1 file, 14 tests passed |
| `pnpm typecheck` | 0 | TypeScript completed without diagnostics |
| `pnpm check` | 0 | 53 files and 461 tests passed; teaching docs, flag docs, build, and 7 commit-evidence tests passed |
| `pnpm verify:package` | 0 | Packed consumer compiled public types and verified runtime, schema exports, and CLI help |

The staged-tree quality run executes `pnpm check`, `pnpm schema:check`, `pnpm verify:cli`, `pnpm verify:package`, `pnpm assets:verify`, and `pnpm audit:ci`. Every command exited 0. CLI verification reported 107 passes and 0 failures; release assets reproduced 9 files without changes.

## GitHub evidence inspected before the corrective commit

- CI run `38137955232`: raw log inspected; lint/test and examples jobs succeeded on original commit `0dbc05a96e0da772839ed756573108fc4ee6958f`.
- Composite action run `38137955253`: raw log inspected; the smoke workflow succeeded on the original commit.
- Title run `38142425764`: raw log/status inspected after correcting the title; it succeeded.
- Earlier title runs failed because the title did not follow the repository's conventional-title regex. The title is now `feat(import): preserve LangSmith address and revision metadata`.

## Limitations and final merge gate

The GitHub runs above predate the corrective commit and are not evidence for its final tree. After push, all final-head checks and their raw logs must be inspected before merge. The package verification emits npm's existing `manage-package-manager-versions` deprecation warning; it does not affect the successful consumer checks. `pnpm audit:ci` reports one low and two moderate vulnerabilities; the configured high-severity gate passes, and this PR does not change dependencies.
