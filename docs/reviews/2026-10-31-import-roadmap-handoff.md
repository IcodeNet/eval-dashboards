# Import roadmap handoff — 2026-10-31

## Langfuse PR #93

[PR #93](https://github.com/IcodeNet/eval-dashboards/pull/93) already contains the
4C.17 implementation. Continue that PR rather than submitting duplicate changes.

Two review findings were verified and fixed:

- `src/cli/import-adapters.ts:654`: flattened provenance IDs now require strings,
  including empty strings, so an explicit empty value clears a stale nested ID.
  Non-string values cannot overwrite nested evidence.
- `test/import-adapters-ragas-langfuse.test.ts:180`: regressions cover empty and
  malformed flattened IDs alongside the existing field mapping/schema tests.
- `docs/integrations/langfuse.md`: use the actual Langfuse importer rather than the
  generic mapper; let the report command select the generated run ID.

Verification before staging the handoff:

- `pnpm check`: pass, 86 files / 769 tests, typecheck, teaching replay, flag docs,
  build, and 9 commit-hook tests.
- `pnpm assets:verify`: pass, 18 tracked files reproduced including screenshots.
- `node dist/cli/index.js import --from=langfuse --input=test/fixtures/langfuse-provenance-sample.json --out=/tmp/eval-pr93-oct31/import/report.json`: pass, 2 rows.
- `node dist/cli/index.js report --input=/tmp/eval-pr93-oct31/import --reporter=html --reporter=json-summary --report-dir=/tmp/eval-pr93-oct31/report`: pass, HTML and JSON output.
- `git diff --check`: pass. No schema version, public flags, or workflow files change.

Commands use the installed project-pinned pnpm 12.14.0 first in PATH and
`PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`. Exact staged-tree checks and review
must pass through `pnpm quality:record`, `pnpm quality:review`, and
`pnpm quality:verify` before committing; their unmodified logs are stored in the
worktree Git directory under `quality-evidence/`.

## Raw GitHub Actions log inspection

Inspected logs on original PR head `1f8917db04e718f80ef4fbfb3d81594c339397b9`:

- [Title lint job 122693703729](https://github.com/IcodeNet/eval-dashboards/actions/runs/40651901838/job/122693703729):
  failed because the title lacked a Conventional Commit prefix. The PR title was
  corrected to `fix(import): preserve Langfuse score provenance`.
- [CI job 122692942420](https://github.com/IcodeNet/eval-dashboards/actions/runs/40651671009/job/122692942420):
  86 files / 767 tests passed; package, schema, CLI, teaching docs, accessibility,
  and release assets ran. Audit reported 2 low and 7 moderate issues; no high or
  critical issues, so the configured high-severity gate passed.
- [Examples job 122693654912](https://github.com/IcodeNet/eval-dashboards/actions/runs/40651671009/job/122693654912):
  both basic JSON and provider-free agent report examples executed.
- [Composite action job 122692943315](https://github.com/IcodeNet/eval-dashboards/actions/runs/40651670953/job/122692943315):
  includes an intentional gate failure and verifies the returned `passed=false`
  output. Embedded exit-1 messages do not represent a silently skipped check.

These logs apply to the original head; inspect the updated head's CI before
claiming it merge-ready. No merge or package publication is authorized here.

## External integration queue

Rechecked [Assistant-UI PR #9044](https://github.com/assistant-ui/assistant-ui/pull/9044)
on 2026-10-31: head remains `162962c9afc71352e068f85fe5c1a60f5c91dc2f`, still a
conflicting draft, with no GitHub review submissions. 4C.4 stays open. The
independent Inspect AI acceptance changes remain preserved in the original
checkout for a separate follow-up. Publishing 1.0.0 stays on hold.

## Inspect AI acceptance follow-up

Restored the independently verified 4C.16 changes onto a separate branch after
pushing the Langfuse review fixes. This follow-up is stacked on PR #93.

- `src/cli/import-adapters.ts:1136`: every usable scorer must meet the threshold;
  a boolean true cannot hide a failing numeric score. Errors still fail the row.
- `test/import-adapters-inspect-ai.test.ts:100`: synthetic single-log and log-array
  imports validate the schema, descriptions, error handling, and suite totals.
- `test/import-adapters-inspect-ai.test.ts:125`: primitive/object score combinations
  cover pass/fail boundaries; `:141` asserts exit 2 for missing/categorical-only scores.
- `docs/integrations/inspect-ai.md`: documents the threshold assumption, unsupported
  categorical values, JSON dump path, and runnable fixture/risk-register gate.

Focused verification: `pnpm exec vitest run test/import-adapters-inspect-ai.test.ts`
passed all 9 tests. The same six exact-tree quality gates and evidence review are
required before committing this follow-up. No workflow changes or publication.

## Promptfoo assertion-component parity (4C.18 / PR #92)

Reconciled the pending PR with main after #93/#94 merged. Its proposed 4C.16
number collided with Inspect AI, so this slice is 4C.18. Retained main's lockfile
and dependency policy: the old Vite override was unnecessary on current main.

The importer maps component assertion type/pass, expected assertion value,
finite numeric score (as actual), threshold and weight into existing row checks.
Unnamed checks use their original component position; invalid components do not
renumber later checks. Checks remain evidence and do not alter aggregate pass/fail.
RunnerEvalCaseResult exposes the optional existing checks shape and the default
row mapper preserves it. No eval-report/v1 contract or CLI flags change.

Evidence: src/cli/import-adapters.ts:215; src/adapters/runner.ts:100;
test/import-adapters.test.ts:188; test/runner-adapter.test.ts:36. The synthetic
native-export fixture is test/fixtures/promptfoo-checks-sample.json.

Focused verification: `pnpm exec vitest run test/import-adapters.test.ts test/runner-adapter.test.ts`
passed (2 files, 35 tests). Full commit-quality gates are required for the staged
merge result before committing, and updated-head raw CI logs before handoff.

Mapping verified against [Promptfoo output docs](https://www.promptfoo.dev/docs/configuration/outputs/):
componentResults holds individual assertion evidence; aggregate success/score
remain separate, and error rows may lack assertions. The guide calls out that
actual is the component score, check types are runner-defined strings, fallback
labels are positional, and component reasoning has no check-level field in v1.
