# assistant-ui local integration record — 2026-10-07

Repository: `assistant-ui/assistant-ui`

Starting commit: `5a09ea34f77fc68a390bdfb00f5e45ea9f306fa9`

No upstream commit or pull request existed when this record was written.

## Implemented locally

- Added `@icodenet/eval-dashboards` as a published package dependency of the
  standalone `evals` harness.
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

## Verification run

- `npm test` in `evals/`: five adapter and CLI regression tests passed.
- `npm run typecheck` in `evals/`: exited 0.
- `npm run dashboard:smoke` in `evals/`: exited 0 after proving the positive
  gate, the execution-error failure path, report generation, and HTML escaping.
- `npm audit --audit-level=high --json` in `evals/`: zero vulnerabilities at
  all reported severities.
- `pnpm turbo build --filter='@assistant-ui/docs^...'`: 30 tasks succeeded.
- `pnpm --filter @assistant-ui/docs exec vitest run next.config.test.ts`: four
  tests passed, including the `/eval-dashboard/` rewrite.
- The generated report was loaded through the running docs app at
  `http://127.0.0.1:4320/eval-dashboard/` and displayed two rows with one
  expected baseline failure and one guided pass.

## Scope and next deliverables

The smoke report is deliberately labelled synthetic. It checks integration
behavior and does not support a claim about assistant-ui model quality. Before
an upstream PR is raised:

1. Add further named suites beyond the current comment-hygiene cases, each with
   a documented risk, reproducible baseline, and independently reviewable
   rubric.
2. Run those suites with recorded agent and judge model versions and enough
   trials to state the observed result without hiding variance.
3. Preserve and review the real `eval-report/v1` artifacts with
   `eval-dashboards lint`, `check`, and `report`; record failures and fixes, then
   rerun affected suites.
4. Open a draft upstream PR that links the measured evidence and reports the
   exact commands and unresolved limitations.

These steps remain open in Roadmap 4C.4. Synthetic fixtures do not close them.
