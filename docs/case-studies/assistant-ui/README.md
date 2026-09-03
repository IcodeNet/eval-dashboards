# Case Study: Adopting eval-dashboards in assistant-ui

**Target repo:** [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) — MIT licensed, ~12k GitHub stars, actively maintained (commits within the hour at the time of this run).
**Adapter added:** `evals/src/eval-report-adapter.ts` (local, not upstreamed — see [Status](#status) below).
**Verified:** locally against a real `claude` CLI run, real judge scoring, real pass/fail evidence.

This is the first real external-adoption proof for the `eval-dashboards-adopt`
skill (`skills/eval-dashboards-adopt/SKILL.md`) and the `writeEvalReportArtifact`
runner adapter — run against a genuine open-source repo's own eval harness,
not a synthetic fixture.

## The target harness

`assistant-ui/evals/` is a small, real prompt-guidance A/B harness: it seeds a
sandbox with files, hands a coding agent a realistic task (e.g. "apply this
PR-review feedback"), judges the result with a fresh LLM instance against a
rubric, and reports a pass rate per candidate guidance string. Its own
[README](https://github.com/assistant-ui/assistant-ui/blob/main/evals/README.md)
documents exactly why: `AGENTS.md` is loaded into every agent session, so
every line in it has a cost — a guidance sentence only earns its place if it
measurably fixes a mistake an undirected agent makes.

Before this integration, the harness's only output was a markdown table
printed to `results/latest.md` — no machine-readable artifact, no history, no
dashboards, no CI gate.

## What was added

One new file (`evals/src/eval-report-adapter.ts`, ~100 lines) and a 4-line
addition to the existing `cli.ts` entry point — nothing in `runner.ts`,
`agent.ts`, `judge.ts`, or `cases/` was touched:

```diff
+import { writeEvalReportArtifact } from "./eval-report-adapter.ts";
 ...
+const artifactPath = await writeEvalReportArtifact(results);
+console.log(`Wrote ${artifactPath} (eval-report/v1)`);
```

The adapter maps the harness's own `CaseResult[]` (one entry per case, each
holding per-candidate `VariantResult`s with raw trial verdicts) into one
`eval-report/v1` row per (case, candidate) pair, using
`writeEvalReportArtifact` from `@icodenet/eval-dashboards` rather than
hand-rolling the JSON shape.

## The real run

```sh
JUDGE_MODEL=claude-sonnet-5 AGENT_MODEL=claude-sonnet-5 TRIALS=1 node src/cli.ts
```

18 rows (3 cases × 6 candidates), reproducing the harness's own documented
finding exactly:

| Case | baseline | describe-now | no-history | why-not-what | delete-stale | drop-tombstones |
|---|---|---|---|---|---|---|
| `pr-review-comments` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `bugfix-comments` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `verbose-new-code` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Suite total: **14/18 passed (77.8%)**. The real judge's stated reason for the
`baseline` failure on `pr-review-comments`:

> "The comment on timeoutMs references the previous value ('bumped from 8000
> to 10000'), which violates the rule against referencing prior values or the
> change."

Full artifact: [`run-artifact.json`](./run-artifact.json).

```sh
eval-dashboards lint --input=.evals_output      # 0 errors, 18 warnings (see below)
eval-dashboards check --input=.evals_output --allow-blocked-baseline   # gates passed
eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

## Real friction found (not fabricated, not fixed by working around it)

**1. `RunnerEvalCaseResult` drops taxonomy fields silently.** The helper's
default input type (`RunnerEvalCaseResult`, in `src/adapters/runner.ts`) has
no `kind`, `agentVersion`, `promptVersion`, or dataset/rubric fields at all —
passing `kind: 'agent'` on a plain case object is silently ignored by
`createDefaultRow()`. The fix required using the `mapRow` escape hatch to
construct the row by hand. **This is a real product gap, not fixed yet** —
tracked in `docs/ROADMAP.md` Phase 4B. A future fix should either widen
`RunnerEvalCaseResult` to accept the common taxonomy fields directly, or
document `mapRow` as the expected path for `kind`/versioning from the start
(currently under-documented).

**2. Vacuous-truth bug in the adapter itself, caught by dogfooding.**
`Array.prototype.every()` on an empty array returns `true` — an
all-errored trial set (0 scored trials) was initially marked `passed: true`.
Fixed in the adapter by explicitly checking `scoredTrials.length === 0` first.
Not an eval-dashboards bug, but exactly the kind of mistake a taxonomy-aware
adapter helper should make harder to write.

**3. `lint` correctly flags real, still-open evidence gaps.** All 18 rows
warn `missing-agent-evidence` (no `turns`/`toolCalls` captured) — genuinely
true: the harness's `agent.ts` doesn't record the agent's tool-call
trajectory today, only the final file contents. This is accurate signal, not
adapter noise — closing it would mean extending `runAgent()` to capture
Claude Code's tool-use transcript, which the harness doesn't do yet.

**4. Environment gotcha, not a bug in either repo.** The harness's judge
(`judge.ts`) hardcodes `claude-sonnet-4-6`; that model wasn't authorized on
the CLI account used for this run (403, allowed models were
`claude-sonnet-5`, `claude-opus-4-8/5`, `claude-haiku-4-5`, etc.). Overriding
via the harness's own `JUDGE_MODEL`/`AGENT_MODEL` env vars fixed it — no code
change needed, but worth knowing if you reproduce this run.

## Open question: baseline vs. candidate pass rate

The suite-level `passRate` (77.8%, 14/18) blends two kinds of rows that mean
opposite things for this harness shape: `baseline-evidence` rows are
*supposed* to fail (a passing baseline means the case tests nothing), while
`candidate-guidance` rows are the real pass/fail signal. A flat suite pass
rate is not the right headline metric here — the per-row `category` and the
report's row table are the correct signal, not the aggregate. This is
tracked as an open decision in `docs/ROADMAP.md` Phase 4B rather than
resolved silently.

## Status

This adapter and CLI wiring exist **locally only**, in a worktree of
`assistant-ui/assistant-ui`. No PR has been opened — see
`docs/ROADMAP.md` Phase 4B and `docs/community-partnership-log.md` for the
adoption-funnel decision to hold off on a real PR until deliberately chosen
to send one. This case study documents the integration and its real findings
regardless of whether a PR follows.

## Why this matters for the roadmap

This is the first genuinely external validation of both
`skills/eval-dashboards-adopt/SKILL.md` and the `writeEvalReportArtifact`
runner adapter against a repo neither authored nor influenced by
eval-dashboards. Per `docs/ROADMAP.md` Phase 4B: real user friction (found
here — items 1 and 3 above) is more valuable once it comes from a genuine
external integration than from internal guessing, and this run produced two
concrete, actionable findings that internal dry-runs against synthetic
fixtures did not surface.
