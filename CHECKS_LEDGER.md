# Completion Check Ledger (eval-dashboards)

Use this ledger before declaring any task finished.

## 1) Scope and Contract Guard

- Confirm requested scope is complete.
- Confirm `eval-report/v1` compatibility is preserved unless a breaking change is explicitly intended.
- Confirm schema/docs/examples are updated together when contract fields change.
- Confirm docs truth-sync across `README.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/publishing.md`, and `docs/examples.md`.
- Confirm command-help snapshots in `docs/cli-help/*.txt` match live CLI output for: `report`, `check`, `publish`, `import`, `teach`, `init`.
- Confirm teaching-doc output blocks still match the CLI by running `pnpm teach:verify`.
  Every fenced ```text block in `docs/teach-exercises/` and the replayable labs is asserted
  line-by-line against a real replay. Never hand-edit an expected-output block to make it
  look right: run the exercise and paste what the CLI actually printed. A 2026-09-15 audit
  found four exercises documenting output the CLI never produced, one of which claimed a
  gate passed when it exits `1`.
- Confirm each integration guide links `docs/integrations/risk-register.md` and uses it as a completion gate.

## 1a) Docs Consistency Checklist (completion-claim gate)

Run this whenever a change marks a roadmap or status item complete. A 2026-09-14 audit of
`docs/ROADMAP.md` found six items marked `- [x]` that no code supported, so completion claims
are treated as assertions requiring evidence, not as prose.

Before flipping any `- [ ]` to `- [x]` in `docs/ROADMAP.md` or adding a "done" line to
`docs/STATUS.md`:

- Cite the evidence in the commit message as `path:line` for each claim. A claim with no
  citable code, test, or committed artifact does not get checked off.
- Confirm the item's own acceptance criteria are all met, not just the headline sentence.
  Partial delivery is reworded to describe what shipped; it is not marked complete.
- Confirm a test covers the behaviour. Per `AGENTS.md`, items are done only when code **and**
  tests exist.
- For CLI surface changes, confirm the matching `docs/cli-help/*.txt` snapshot was regenerated.
- For contract changes, confirm schema, `docs/artifact-format.md`, and examples moved together.

Claims that cannot be evidenced from this repository:

- Work landing in an **external** repository is not marked complete here without a link to the
  external commit or PR in the roadmap line itself. "Wired up locally" is not done.
- Work that is **documentation-only** for a backlog item whose acceptance criteria demand code
  (fixtures, adapters, tests) stays open, with the docs progress noted inline.
- **Process or alignment claims** ("kept in sync", "reviewed each release") need a mechanism, a
  CI check, or a dated record. An unfalsifiable promise is not a completion.

When an audit downgrades a claim, keep the item open and append a dated `Audit YYYY-MM-DD:` note
naming the evidence gap, so the next reader sees why rather than only a flipped box.

## 2) Verification Evidence

- Include exact commands used for validation.
- Include pass/fail outcomes for each command.
- If publishing is touched, include target and resulting artifact location.

## 3) Required Local Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm teach:verify` (whenever gate diagnostics, lint rules, or teaching docs change)

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
