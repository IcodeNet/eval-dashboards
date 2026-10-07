# Commit quality and Codex hook approval

The project Codex hook is defined in `.codex/hooks.json`. Open Codex in this
repository and use `/hooks` to review and trust the definition. The installer
does not approve it. If this task is attached to a different folder, open the
actual eval-dashboards project root to review its project hook.

The `PreToolUse` hook checks direct Git commits before execution. The Lefthook
`pre-commit` hook checks the same evidence for ordinary Git commits outside
Codex. Install Git hooks with `pnpm exec lefthook install` after cloning.

## Workflow

1. Finish the change and stage the intended files. Keep unrelated work separate;
   this gate rejects unstaged tracked files and untracked files, because tests
   against those files would not prove the staged commit works.
2. Run `node scripts/commit-evidence.mjs snapshot` and retain the `tree` and `head`.
3. Review that staged diff for correctness, regressions, and unsupported claims.
   Resolve findings and repeat the review when the staged content changes.
4. Run `pnpm quality:record`. It executes `pnpm check`, `pnpm schema:check`,
   `pnpm verify:cli`, `pnpm verify:package`, `pnpm assets:verify`, and
   `pnpm audit:ci`. Exact outputs and exit statuses are stored beneath the
   worktree's Git directory in `quality-evidence/`.
5. Write a JSON review record outside the working tree (for example in `/tmp`),
   then run `pnpm quality:review /absolute/path/review.json`.
6. Run `pnpm quality:verify`, then use a standalone `git commit -m "..."`.

Review record shape (replace the example values with the actual review):

```json
{
  "tree": "the tree returned by snapshot",
  "head": "the HEAD returned by snapshot, or null for a new repository",
  "reviewer": "the person or agent that performed the review",
  "verdict": "pass",
  "findings": [],
  "claims": [
    {
      "claim": "Describe a behavior actually checked",
      "evidence": [{ "path": "test/relevant.test.ts", "line": 1 }]
    }
  ]
}
```

Findings, when present, must have `status: "resolved"`; include their description
and resolution. Citations must resolve to lines in staged files. Put exact
verification commands, results, limitations, and any required raw CI log review
in a durable report under `docs/reviews/`. External adoption still requires an
external commit/PR link before marking it complete.

## Guarantees and limits

Changing staged content or HEAD invalidates prior evidence. A failed rerun
invalidates the prior successful check record. Altered check logs are rejected.
The gate does not stage files, commit changes, grant hook trust, run an AI review,
or claim that a citation proves its associated assertion. Review quality remains
the reviewer's responsibility; the JSON is a recorded attestation.

These are local development safeguards, not tamper-proof enforcement. Codex
hooks are skipped until trusted, and hook runtime failures can fail open. Git
hooks can be bypassed or uninstalled by a local user. CI and protected-branch
requirements remain necessary for organization-wide enforcement. The Codex
guard rejects common bypass flags and compound commit commands; it is not a
general shell interpreter or a security boundary against arbitrary scripts.

Official hook format and trust behavior: <https://learn.chatgpt.com/docs/hooks>.
