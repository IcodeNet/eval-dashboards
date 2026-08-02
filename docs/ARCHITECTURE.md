# Architecture (agent-oriented)

Short map of how the system is intended to work. Prefer this over inventing new layers.

## Data flow

```text
Eval runners (Vitest, Jest, custom, agent harnesses, …)
        │
        │  emit eval-report/v1 JSON artifact(s)
        ▼
   .evals_output/**/*.json
        │
        ▼
┌───────────────────┐
│  discovery + load │  io/
│  validate model   │  model/
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ report context    │  normalized run + suites + rows + history/comparison
└─────────┬─────────┘
          │
    ┌─────┼─────┬────────────┐
    ▼     ▼     ▼            ▼
 reporters  gates  history   publish
  html/     check   trends    dir / gh-pages / azure…
  text/
  md/json
```

## Design principles

1. **Artifact is the API.** Core libraries should not require live model calls.
2. **Normalize once, report many times.** Reporters consume a shared context, not raw files.
3. **Taxonomy is optional at the type level, central at the product level.** Validation stays lenient; docs, examples, lint, and UI teach completeness.
4. **Publish adapters are edges.** Keep secrets and cloud SDKs out of core report logic.
5. **CLI is a thin layer** over libraries under `src/` so programmatic use remains possible.

## Extension points

| Extension | How |
|-----------|-----|
| New reporter | Implement reporter interface; register in CLI/config |
| New publish target | Adapter under `publish/` with dry-run |
| New gate | Pure function over report context + thresholds |
| New taxonomy enum value | Additive on schema + docs + examples; avoid renames |

## Where NOT to put logic

- Do not put vendor-specific judge prompts in core.
- Do not require network in `report` or `check`.
- Do not embed large frameworks for static HTML unless justified.

## Key docs

| Doc | Role |
|-----|------|
| `artifact-format.md` | Contract |
| `taxonomy.md` | Meaning of fields (when added) |
| `PROPOSITION-AND-TAXONOMY.md` | Why / phases |
| `PROPOSITION-REVIEW.md` | Risks / MVP |
| `gates.md` / `reporters.md` / `publishing.md` | Feature docs |
| `STATUS.md` | Implementation truth |
