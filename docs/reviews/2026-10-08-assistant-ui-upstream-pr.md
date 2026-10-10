# Assistant-ui upstream integration review — 2026-10-08

## External change

- Issue: [assistant-ui/assistant-ui#9043](https://github.com/assistant-ui/assistant-ui/issues/9043)
- Draft PR: [assistant-ui/assistant-ui#9044](https://github.com/assistant-ui/assistant-ui/pull/9044)
- Reviewed head: `270f3f98fef3e66282798c93a29b86aaefa8754b`
- Agent: `claude-haiku-4-5`
- Judge: `claude-sonnet-5`

The draft PR preserves the published `@icodenet/eval-dashboards@0.8.0`
dependency, `eval-report/v1` adapter, five-suite registry, raw real-model
reports, local dashboard commands, and `/eval-dashboard/` docs route. The
existing Claude CLI workflow was retained.

## Measured evidence

The PR's `evals/evidence/2026-10-08/` directory contains seven raw reports and
a README with per-file SHA-256 values, exact commands, model versions, trial
counts, fixes, reruns, and limitations. A verification script recomputed every
hash after CI formatting and confirmed each value was recorded. Every raw
report validates as `eval-report/v1`, contains explicit agent/judge IDs, has
zero execution errors, and contains no Anthropic secret-key prefix.

- Five-suite exploratory run: 16/22 rows matched expectations.
- Registry source-of-truth final paired run: baseline 0/3, guidance 3/3.
- Optional host-SDK final paired run: baseline 0/3, guidance 3/3. An earlier
  guided run scored 2/3 and remains preserved as variance evidence.
- PR-review comment final paired run: baseline 0/3, `delete-stale` 0/3. Its
  matched-expectation gate remains red at 0.500 and is not presented as passing.

## Local verification

Commands were run from the assistant-ui checkout unless noted:

- `npm run lint:fix` in `evals/`: exit 0; 20 files formatted.
- `npm test` in `evals/`: exit 0; 3 files and 7 tests passed.
- `npm run typecheck` in `evals/`: exit 0.
- `npm run dashboard:smoke` in `evals/`: exit 0; the command also verified its
  expected internal negative-gate exit. This is synthetic plumbing evidence.
- `npm ci` in `evals/`: exit 0; 122 packages audited, 0 vulnerabilities.
- `npm audit --audit-level=high` in `evals/`: exit 0; 0 vulnerabilities.
- `pnpm --filter @assistant-ui/docs test next.config.test.ts`: exit 0; 1 file
  and 5 tests passed, including both dashboard route forms.
- `pnpm exec oxfmt --check evals/evidence/2026-10-08/README.md evals/evidence/2026-10-08/*.json`:
  exit 0 after reviewing the CI autofix.
- `git diff --cached --check`: exit 0 before each human-authored commit.

The first direct push to upstream returned HTTP 403 because `IcodeNet` is not a
repository collaborator. A standard fork was created, the branch was pushed to
`IcodeNet/assistant-ui`, and the draft PR targets upstream `main`.

## CI and review state

GitHub Actions checks for head `270f3f98fef3e66282798c93a29b86aaefa8754b`
passed, including API drift, changed-app/package builds, review-policy scripts,
semver, source-snapshot budget, template sync, test coverage, changed-package
typecheck, dependency policies, workspace ranges, and autofix.

Raw logs were read with:

- `gh run view 37855827252 --repo assistant-ui/assistant-ui --log` — exit 0;
  quality/build/typecheck workflow.
- `gh run view 37855827269 --repo assistant-ui/assistant-ui --log` — exit 0;
  Test Coverage completed in 14m55s and uploaded coverage artifact
  `11583873591` with SHA-256
  `9d614b812d7edd0ff2598e191ae5084570b1393db194b0f832b63d2fe351f088`.

The first autofix commit only reformatted `graders` arrays in the raw JSON.
That changed the report bytes, so all seven evidence hashes were recomputed,
reviewed, committed as `270f3f98f`, and rechecked. The second autofix run made
no content changes.

CodeRabbit and Claude review jobs skipped because the PR is a draft. The
external Rupic review remains pending. The upstream PR checklist item therefore
stays open until that result is available and inspected. No merge or upstream
acceptance is claimed.
