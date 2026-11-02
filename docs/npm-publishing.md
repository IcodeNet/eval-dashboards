# npm Publishing Workflow

This document explains how `@icodenet/eval-dashboards` is published to npm.

## Overview

Primary release path uses the trusted-publishing workflow:

- Trigger `.github/workflows/publish.yml` manually with the version in `package.json`
- Trigger it only after the release PR has merged and the selected ref is `main`
- Publishes to npm using GitHub Actions OIDC trusted publishing
- Creates GitHub release + tag (`vX.Y.Z`)
- Does not require an `NPM_TOKEN` secret

The former Semantic Release experiment was removed. It required a separate
token-based release path and duplicated version, changelog, tag, and publish
responsibilities. The trusted-publishing workflow is the sole supported path.

<a id="next-release-plan--checked-2026-11-01"></a>

## Next release plan — checked 2026-11-02

Pre-publication registry check (2026-11-02): npm exposed `0.10.0` as
`latest`, published on 2026-10-19. Its registry
`gitHead` is `3c535671c3e3571cc3c8c9c5369c36077be8f584`. GitHub's latest release
was also `v0.10.0` at that check. The package version in this release candidate is `0.11.0`;
changing it and merging features do not publish a package.

**Authorized candidate: `0.11.0`, the portable analytics milestone.** On
2026-11-02 the owner explicitly requested a new release if new functionality
had landed. Portable M1 functionality has landed, so that request authorizes
this release after verification and supersedes the earlier publication hold.
The release PR and resulting main revision must pass the acceptance steps below.
The owner also reaffirmed the standing delivery rule: merge reviewed green PRs
to main and release package versions at reasonable milestones. Apply that rule
to coherent portable 0.x releases after the checks below, rather than bumping
after every PR. Documentation-only changes and private hosted groundwork do
not by themselves require a package release. Record the milestone and evidence.
The existing explicit owner gates for 1.0.0 and hosted deployment still apply.
Do not wait for the hosted M2–M6 backlog to publish a coherent portable update.
The existing `1.0.0` owner decision and stable-release gate remain separate.

### Scope already merged for the candidate

- Configured gate decisions in reports, with neutral pass-rate styling and
  explicit not-evaluated output when no policy evaluation ran (#96).
- Matching-case comparisons, introduced/removed failures, measurement versions,
  score direction, and measured/missing telemetry coverage (#97).
- Optional paired comparison with conservative bounds and an inconclusive
  verdict; ordinary point-gate defaults remain unchanged (#99).
- Promptfoo assertion evidence, Inspect AI mixed-score/error handling, Langfuse
  provenance and ID fixes, and Phoenix decision/trace evidence (#92–#94, #100).
- Malformed evidence-bundle validation, which verifies digest integrity and does
  not authenticate a signer (#95).
- Required PR structure, review/merge rules, consistent pnpm/dependency versions,
  and reviewable metrics artifacts (#98, #101).

### Work to finish before opening the release PR

- [x] Repeated-trial slice merged in [#102](https://github.com/IcodeNet/eval-dashboards/pull/102): optional sampling declarations,
  within-case bounds, unknown evidence, shared reporter output, examples and
  regression tests (`test/repeated-trials.test.ts`).
- [x] Complete reusable policy evaluator merged in [#103](https://github.com/IcodeNet/eval-dashboards/pull/103), with public/CLI/report parity
  for critical failures, expected negatives, waivers, calibration, baseline drift,
  threshold changes and tier budgets (`test/gate-decision.test.ts`,
  `test/cli-pr-tiering.test.ts`). Paired statistics preserve raw observations
  (`test/evaluate-policy.test.ts`). A hosted API itself remains M2 work.
- [x] Node compatibility fix merged in [#104](https://github.com/IcodeNet/eval-dashboards/pull/104). Its raw CI verified strict consumers
  on Node 20.20.2 / 22.23.4 / 24.22.1 / 26.13.0 and no engine warnings,
  preserving `engines: >=20` (`scripts/verify-packed-package.mjs`).
- [x] Reconcile `CHANGELOG.md` against npm gitHead
  `3c535671c3e3571cc3c8c9c5369c36077be8f584` through merged main
  `bbbe9d58227080fda45079008bac2a1640318441`. Hosted features are not shipped;
  4F.11 signed-bundle authentication remains open.
- [x] Prepare the focused `0.11.0` candidate: version, changelog section,
  M1 acceptance tests and documentation are synced (`package.json`,
  `test/evaluate-policy.test.ts`). The acceptance procedure below governs
  checks, review, merge verification and approval of the exact merged revision.

### Release acceptance and publication

1. Pass `CHECKS_LEDGER.md` and all protected-main checks for the release PR.
   Include schema compatibility, teaching/flag checks, security audit, package
   consumer verification, offline examples, and reproducible report assets.
   Verify the actual tarball's public runtime/type/schema/CLI exports.
2. Address review findings, reply with fixes and evidence, resolve addressed
   threads, merge the release PR, and verify the resulting main revision and
   its raw CI logs. A green feature branch alone is not a release candidate.
3. Record the applicable owner authorization and concrete milestone scope.
   The 2026-11-02 request authorizes portable 0.11.0 for completed M1 and
   establishes normal 0.x milestone releases after verified merges. Merging
   one PR does not itself establish a release milestone. Keep the separate
   1.0.0 and hosted-deployment owner gates.
4. Dispatch `Publish to npm` from verified `main` with version `0.11.0`. Use the
   existing OIDC workflow; create no alternate token-based release path.
5. Inspect its raw log and verify registry version/dist-tags, the GitHub
   release/tag, installed CLI version, and a report generated from the installed
   tarball. If publication is partial or fails, inspect the registry before
   retrying; npm versions cannot be overwritten.

M2 accounts/ingestion, M3 hosted review screens, M4 richer analytics views,
M5 live progress/scale, and M6 launch operations stay on their own roadmap.
Assistant-ui remains parked. This plan neither publishes nor deploys a hosted
platform. Portable M1 semantics are complete in the candidate; hosted M2–M6
and the rest of the roadmap remain open.

## Runtime compatibility

The package keeps `engines.node: >=20`. Its optional SQLite history store needs
Node 22.5 or newer; file history and static HTML remain available on Node 20.

A fresh npm install resolves runtime dependencies independently of this
repository's pnpm lockfile. The Octokit 22 line currently resolves a request
client that depends on `content-type` 3, whose declared engine is Node >=22.
Strict Node 20 installation therefore fails even though the locked local tree
and non-strict action smoke test can run. Repository source now uses the
compatible Octokit 21 line (resolved REST 21.1.1 / request 9.2.4), preserving
Node 20 support. Revisit that choice when an upgrade passes the same checks;
do not waive the engine error or silently raise the package minimum.

`pnpm verify:package` builds a real tarball, installs it in a fresh consumer with
`--engine-strict`, prints the resolved Octokit tree, compiles public types and
runs ESM/CommonJS, complete-policy, schema, CLI, file-history and offline HTML
checks. It also exercises the installed GitHub client with simulated fetch
responses and generates a mail message in memory. These checks make no live
GitHub writes or email deliveries. SQLite round-trips run where supported.

Required CI runs this installed consumer on Node 20, 22, 24 and 26, while keeping
the full development test suite and documentation tools on Node 22. The main
job restores Node 22 before its remaining checks. A future dependency upgrade
must pass all consumer steps, not only the development suite's green badge.
This compatibility fix merged in #104 and does not change npm 0.10.0
retroactively. The 0.11.0 candidate has owner authorization dated 2026-11-02;
actual publication still requires the verified main workflow and registry checks.

## Required Secrets

### Trusted publishing

Configure the package on npm for trusted publishing from this GitHub repository and the `Publish to npm` workflow. No npm automation token is required for the primary path.

## Conventional Commit Rules

The repository uses conventional commits for reviewable history and release
notes:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `perf:` -> patch bump
- `feat!:` or `BREAKING CHANGE:` -> major bump
- `docs:` / `chore:` by default do not publish a new release unless configured

This repository also accepts ticket/initial prefixes before the type, for example:

- `[AB#272021] [BT] feat: add grouped report index`
- `[AB#272021] [BT] fix: handle missing suite manifest`

## Publish Flow

1. Finish the milestone on a branch and make all required quality, audit,
   package-consumer, asset, and review checks pass.
2. Update `package.json` and `CHANGELOG.md` for the intended version in the
   release PR.
3. Merge the reviewed release PR to `main`.
4. Verify the resulting `main` commit and its required GitHub Actions checks.
5. From the `main` branch in GitHub Actions, run `.github/workflows/publish.yml`
   manually with the version input.
6. The workflow runs `pnpm release:prepare` before publish, which enforces:
	- project checks (`pnpm check`)
	- deterministic regeneration of release dashboards/screenshots
	- byte-for-byte equality between the candidate assets and the regenerated
	  assets (`docs/images` is checked locally; CI checks the HTML/report files
	  to avoid cross-platform rasterization drift)
7. Publish proceeds only when all checks pass, then creates the npm package and GitHub release.
8. Inspect the raw publish log, confirm the GitHub release/tag points to the
   verified `main` commit, and verify the registry version with `npm view`.

## Local Dry Run

Use dry run to preview next release without publishing:

```bash
pnpm install
pnpm release:prepare
npm pack --dry-run
```

## Manual Publish

Run `.github/workflows/publish.yml` manually from Actions:

- Provide `version` input (must match `package.json`)
- Workflow validates, runs checks, publishes to npm, creates release

The install step in this workflow supports both cases:

- lockfile present -> `pnpm install --frozen-lockfile`
- lockfile absent in ref -> fallback `pnpm install --no-frozen-lockfile`

## Troubleshooting

| Issue | Solution |
|------|----------|
| Push to main does not publish | Run `.github/workflows/publish.yml` with the version from `package.json` |
| PR title lint fails | Rename PR title to conventional format |
| npm publish fails with trusted publishing | Verify the npm package trusted publisher points at this repository and workflow |
| Manual publish version mismatch | Ensure `package.json` version matches manual `version` input |

## Verification

After a successful release:

```bash
npm view @icodenet/eval-dashboards
npm view @icodenet/eval-dashboards version
```
