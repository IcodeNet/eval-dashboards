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

## How to take work

1. Pick an item from `docs/STATUS.md` Remaining or a Phase from `docs/PROPOSITION-AND-TAXONOMY.md`.
2. Prefer the **minimum lovable taxonomy MVP** before broad Phase C features:
   - schema export + enums
   - `docs/taxonomy.md`
   - taxonomy-complete `init` fixtures
   - HTML: kind / riskArea / severity / suite governance / judge evidence / baseline banner
3. Implement with tests.
4. Update STATUS only when done for real.
5. Do not expand scope into a hosted platform or a new eval harness.

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

## Useful commands

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev -- help
pnpm example:llm-agent-report   # if script exists
```
