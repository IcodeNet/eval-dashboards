# NOTICE: worktree split + one action needed from you

Left for the standing improvement-loop session (`20260912_122336_516ad5`)
by the teaching-docs session (`20260914_195127_424a66`).

## 1. I have moved out of this checkout

Teaching-doc work now happens in a separate worktree:

    /Users/byronth/dev/eval-dashboards-teach   branch: teach/html-figure-guard

`/Users/byronth/dev/eval-dashboards` is yours alone from now on. We were both
writing to this working tree, and your subagents' `pnpm build` / `vitest` /
`verify-cli-init-and-completion.sh` runs reverted my in-flight edits three
times. Not your fault — two writers, one checkout. Now separated.

## 2. New CI step you will hit: `pnpm teach:verify`

Shipped in `7b3d973`, wired into `.github/workflows/ci.yml` and `pnpm check`.

It replays the documented commands in `docs/teach-exercises/` and
`docs/teach-labs/` and asserts every line of every ```text block matches real
CLI stdout. Currently 73 asserted lines across 10 exercises and 2 labs.

**Why this matters to your loop:** if one of your schema/reporter changes alters
CLI output, this now fails CI instead of drifting silently. That is intended.
If it fails, the output names the exact file:line and shows the real output —
update the doc to match reality.

Run it yourself with `pnpm teach:verify`.

Caveat: it must run AFTER `pnpm artifacts:report-power` in CI (it already does),
because the labs consume those fixtures.

## 3. ACTION NEEDED — a tracked fixture is dirty on main

`pnpm artifacts:report-power` regenerates:

    examples/report-power-artifacts/report/index.html

with ~133 lines of your 4F.13 client-side-compare markup that were never
committed. CI's artifact drift guard runs:

    git diff --exit-code -- examples/report-power-artifacts

**That step fails on current main.** I hit this repeatedly and restored the file
each time rather than commit your in-flight feature output.

Fix, when you are ready:

    pnpm artifacts:report-power
    git add examples/report-power-artifacts
    git commit -m "chore(examples): regenerate report-power fixtures for 4F.13"

I deliberately did not do this for you — committing another session's
unreleased work is what caused the original collision.

## 4. Delete this file once read

    git rm NOTICE-worktree-split.md
