# Agent Guide — @icodenet/eval-dashboards

Instructions for coding agents working in this repository.

## Mission

This package is the **NYC/Istanbul-style reporting layer for agent/LLM evals**:

1. Runners emit a versioned JSON artifact (`eval-report/v1`).
2. This package validates, reports, gates, histories, and publishes.
3. The long-term product is the **shared schema + taxonomy**, not only HTML chrome.

Read before large changes:

- `docs/PROPOSITION-AND-TAXONOMY.md` — product north star
- `docs/PROPOSITION-REVIEW.md` — risks and MVP slice
- `docs/ROADMAP.md` — priorities
- `docs/STATUS.md` — done vs remaining
- `docs/artifact-format.md` — contract

## Non-negotiables

- **Runner-agnostic core.** No dependency on a single eval harness, LLM vendor, or cloud.
- **Artifact-first.** Prefer improving the contract and emitters over one-off dashboard hacks.
- **Do not break `eval-report/v1` lightly.** Prefer additive optional fields; new `schemaVersion` only for breaking changes.
- **Escape all user/model text in HTML.** No raw interpolation of inputs, outputs, or judge reasoning.
- **Offline by default.** Static reports must work without a server.
- **Honest STATUS.** Mark items done only when code + tests exist.

## Taxonomy (always prefer these fields)

When emitting or documenting artifacts, prefer taxonomy-complete rows/suites:

| Area | Prefer |
|------|--------|
| Row | `kind`, `severity`, `category`, stable `id`, evidence fields appropriate to kind |
| Agent | `toolCalls` / turns, `agentVersion`, `promptVersion` |
| LLM judge | `judgeModel`, `judgeVerdict`, `judgeReasoning`, `axisScores` |
| Suite | `riskArea`, `datasetVersion`, `rubricVersion`, `gate.mode`, graders |
| Cross-run | baseline compatibility, stable ids for new/persistent failures |

Minimal `{ id, suite, passed }` is valid but incomplete. Teach completeness via examples, lint, and UI cues.

## Repo map

```text
src/
  cli/          CLI entry and commands
  config/       config loading
  gates/        quality gates
  history/      trends / comparison
  io/           artifact discovery and load
  model/        eval-report types and validation
  publish/      publish adapters
  reporters/    text, json, markdown, html
  utils/
docs/           product + contract docs
examples/       runnable emitters and CI snippets
test/           vitest tests
```

## Engineering norms

- **Language:** TypeScript, Node `>=20`, ESM.
- **Package manager:** pnpm.
- **Test:** `pnpm test` (vitest). Prefer focused tests next to behaviour you change.
- **Build:** `pnpm build` (tsup). **Check:** `pnpm check` when available.
- **CLI:** keep exit codes meaningful (`0` pass, `1` gates failed, `2` invalid config/artifact, `3` no reports) unless docs say otherwise.
- **Examples must stay runnable.** If you change the artifact shape, update examples and tests together.

## Completion ledger (mandatory)

Before marking work complete, follow `CHECKS_LEDGER.md` in this repository.
Always include raw GitHub Actions log verification for workflows touched by your change; do not rely only on green status badges.

## How to take work

1. Pick an item from `docs/STATUS.md` Remaining or a Phase from `docs/PROPOSITION-AND-TAXONOMY.md`.
2. Prefer the **minimum lovable taxonomy MVP** before broad Phase C features:
   - schema export + enums
   - `docs/taxonomy.md`
   - taxonomy-complete `init` fixtures
   - HTML: kind / riskArea / severity / suite governance / judge evidence / baseline banner
3. Implement with tests.
4. Update STATUS only when done for real.
5. Hosted accounts, ingestion, and live dashboards are owner-approved scope (2026-10-31); follow `docs/hosted-platform-requirements.md`. Preserve the portable offline core. Do not build a new eval harness.

## Safe change patterns

| Task | Approach |
|------|----------|
| New optional artifact field | Add to model + schema docs + example; keep optional; validate leniently |
| New reporter | Follow existing reporter interface; consume normalized report context |
| New gate | Config + CLI flag + tests; document in `docs/gates.md` |
| HTML change | Taxonomy-aware grouping/cues over decorative charts |
| Publish adapter | dry-run first; never log secrets |

## Do not

- Rename the package or CLI without an explicit human decision.
- Commit secrets, tokens, or real production eval payloads with PII.
- Mark ROADMAP/STATUS items complete without tests.
- Add heavy UI frameworks if static HTML already meets the need.
- Couple core to Azure/GitHub APIs beyond publish adapters.

## Writing pull requests

- Use `.github/pull_request_template.md` for every PR description and read `.agents/skills/plain-english-prs/SKILL.md` when drafting or updating one.
- Write in simple English for a reviewer who has not read the chat. Explain the problem, show the same example before and after, include observed evidence, and give the everyday workflow.
- Distinguish test results from benchmarks and code inspection. State when a baseline or measurement was not run; never invent evidence.
- Improve the versioned template when reviewer feedback reveals a clearer approach. Keep it proportionate to the change rather than adding boilerplate by default.

- `lint-description` checks the seven template sections and requires content. Renovate uses the same structure; CodeRabbit summaries belong in review comments. Passing structure does not prove clear wording or valid evidence.

## Delivery loop and cumulative requirements

- Project requirements accumulate: new tasks and instructions add to existing
  requirements unless the owner explicitly changes one. Keep docs/schema/examples
  in sync, use simple English and the PR template, and follow `CHECKS_LEDGER.md`
  for implementation, review fixes, and integration changes alike.
- For owner-authorized roadmap work, finish one focused task, verify it, raise a
  PR, then monitor checks and review comments through completion. Opening a PR
  does not finish the task.
- Refresh the PR head, base, CI, reviews, and discussion before each pass, including findings outside the inline diff. Work
  conflicts first, active review findings next, and CI failures after that.
- Reproduce valid review findings, make the smallest correct fix, run required
  checks, and push. Reply on the original thread with the fix commit and evidence,
  then resolve it. For invalid or obsolete findings, reply with the concrete
  reason before resolving. Never resolve an unaddressed issue to clear a badge.
- After a push, monitor again for new comments and checks. Read actual failing
  logs; inspect raw logs for workflows touched by the change. A skipped check
  is not passing evidence, and a corrected title's newer check supersedes its
  earlier failure. Do not weaken checks to get a green result.
- Merge when the current head is mergeable, applicable checks pass, and no
  actionable review comments or change requests remain. Integrate dependency
  PRs first, retarget stacked PRs to `main`, and verify the remote merge into
  `origin/main`. Continue with the next authorized roadmap item.
- Stop for a concrete blocker needing an owner decision; explain what failed
  and what is needed. Do not invent a new approval step for authorized merges.
  Follow the owner's 2026-11-02 standing instruction to release coherent portable
  0.x milestones after verified merges, using `docs/npm-publishing.md`. Record
  the milestone and evidence; do not release after every PR. The explicit
  1.0.0 and hosted-deployment owner gates remain separate.

## Useful commands

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev -- help
pnpm example:llm-agent-report   # if script exists
```
