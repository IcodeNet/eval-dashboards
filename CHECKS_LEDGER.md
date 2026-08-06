# Completion Check Ledger (eval-dashboards)

Use this ledger before declaring any task finished.

## 1) Scope and Contract Guard

- Confirm requested scope is complete.
- Confirm `eval-report/v1` compatibility is preserved unless a breaking change is explicitly intended.
- Confirm schema/docs/examples are updated together when contract fields change.

## 2) Verification Evidence

- Include exact commands used for validation.
- Include pass/fail outcomes for each command.
- If publishing is touched, include target and resulting artifact location.

## 3) Required Local Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

If CLI/report/publish behavior changed, also run at least one focused command that proves behavior:

- `pnpm dev report --input=<artifact-dir> --reporter=html --reporter=json-summary --report-dir=<out-dir>`
- `pnpm dev check --input=<artifact-dir> ...`
- `pnpm dev publish --target=dir --input=<artifact-dir> --report-dir=<out-dir> --out-dir=<publish-dir>`

If report rendering, report fixtures, or report assets changed, regenerate and verify tracked example/release artifacts:

- `pnpm assets:regenerate`
- `pnpm assets:verify`
- `git diff --exit-code -- eval-report eval-report-dark docs/images`

Record whether artifact regeneration produced expected diffs and whether those diffs were committed.

## 4) History and Trend Integrity

- Confirm run-history files are preserved when trend behavior is expected.
- Confirm `summary.json` and `history.json` reflect expected run count.
- Confirm trend UI claims are consistent with retained history.

## 5) GitHub Actions Log Review (mandatory)

- Always inspect raw GitHub Actions logs for the workflows touched by the change.
- Do not rely only on green checks; verify no critical step was skipped.
- Treat silent pipeline issues (for example piped command failures, warnings masking errors, or fallback paths hiding breakage) as blockers until resolved.

## 6) Finish Gate (must be true)

- Code, tests, and docs are in sync.
- Required checks are green, or blockers are explicitly called out.
- Example/release report artifacts are regenerated and verified when output-affecting changes are present.
- Final report states:
  - what changed,
  - what was verified,
  - what remains (if anything).
