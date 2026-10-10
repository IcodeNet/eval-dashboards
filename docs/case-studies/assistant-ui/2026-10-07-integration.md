# assistant-ui local integration record — 2026-10-07

Repository: `assistant-ui/assistant-ui`

Starting commit: `5a09ea34f77fc68a390bdfb00f5e45ea9f306fa9`

Upstream review: [assistant-ui draft PR #9044](https://github.com/assistant-ui/assistant-ui/pull/9044)

## Implemented locally

- Added `@icodenet/eval-dashboards` as a published package dependency of the
  standalone `evals` harness. The local integration now resolves published
  version 0.8.0.
- Added an adapter that emits one `eval-report/v1` row per trial, stable
  case/candidate/trial identifiers, suite manifests, dataset and rubric hashes,
  judge evidence, and explicit execution-error rows.
- Updated the eval CLI to write `.evals_output/live/latest.json` and to remove
  that exact stale artifact before validating a new run.
- Added lint, check, report, smoke, and docs-output commands. The gate checks
  matched expectations because an expected failing baseline is useful evidence
  rather than a raw pass-rate regression.
- Added a docs-app rewrite that serves the generated static report at
  `/eval-dashboard/`, with a test against the real Next configuration.
- Expanded the registry from three to five behavior cases with
  `registry-source-of-truth` and `optional-host-sdk-dependency`. Both risks
  reproduced in three baseline trials and have independently reviewable
  rubrics derived from the repository's contributor rules.

## Verification run

- `npm test` in `evals/`: seven adapter, CLI, report, and registry tests passed.
- `npm run typecheck` in `evals/`: exited 0.
- `npm run dashboard:smoke` in `evals/`: exited 0 after proving the positive
  gate, the execution-error failure path, report generation, and HTML escaping.
- `npm audit --audit-level=high --json` in `evals/`: zero vulnerabilities at
  all reported severities.
- `pnpm turbo build --filter='@assistant-ui/docs^...'`: 30 tasks succeeded.
- `pnpm --filter @assistant-ui/docs test next.config.test.ts`: five tests
  passed, including `/eval-dashboard` and `/eval-dashboard/`.
- The generated report was loaded through the running docs app at
  `http://127.0.0.1:4320/eval-dashboard/` and displayed two rows with one
  expected baseline failure and one guided pass.
- `npm ls @icodenet/eval-dashboards --depth=0` in `evals/` resolved
  `@icodenet/eval-dashboards@0.8.0`.

## Real model evidence — 2026-10-08

The agent was `claude-haiku-4-5` and the independent judge was
`claude-sonnet-5`. Seven raw `eval-report/v1` files are preserved in PR #9044
with model identifiers, trial evidence, and SHA-256 values.

- `registry-source-of-truth`: final paired run baseline 0/3, guidance 3/3.
- `optional-host-sdk-dependency`: final paired run baseline 0/3, guidance 3/3.
  An earlier guided run scored 2/3, so the record does not claim deterministic
  behavior.
- `pr-review-comments`: final paired run baseline 0/3 and `delete-stale` 0/3.
  The failed guidance gate remains committed as an unresolved finding.
- The five-suite exploratory run matched 16/22 expectations. Two older
  comment-hygiene baselines did not reproduce their intended mistakes.

The measured rows were reviewed, the registry guidance and structured judge
output were corrected, and affected suites were rerun. Synthetic smoke data is
still labelled as plumbing-only evidence and is not counted as model-quality
evidence.

## Upstream state

Draft PR #9044 contains the dependency, adapter, expanded suites, raw evidence,
tests, and route. GitHub Actions passed; the raw quality workflow and
multi-megabyte coverage log were inspected. The PR remains draft while the
external Rupic review is pending, so this record does not claim upstream
acceptance.
