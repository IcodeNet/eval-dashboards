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

## Next release plan — checked 2026-11-01

npm currently exposes `0.10.0` as `latest`, published on 2026-10-19. Its registry
`gitHead` is `3c535671c3e3571cc3c8c9c5369c36077be8f584`. GitHub's latest release
is also `v0.10.0`. The package version in this repository is still `0.10.0`;
merging features into main has not published them.

**Proposed next version: `0.11.0`, the portable analytics milestone.** This is a
plan, not publishing approval. Keep the current publishing hold. Use acceptance
gates rather than a promised date; the remaining M1 work determines the cut.
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

- [ ] Finish and merge the repeated-trial slice: optional sampling declarations,
  within-case bounds, unknown evidence, shared reporter output, examples and
  regression tests. It is in progress in repository source.
- [ ] Finish M1's reusable complete policy evaluator for the future API. Prove
  consistent decisions for critical failures, expected negatives, waivers,
  calibration, baseline/threshold changes, and paired uncertainty. A hosted API
  itself is M2 work and is not part of this npm cut.
- [ ] Resolve the observed Node 20 transitive engine warning. Test the packed
  package and supported feature paths on the advertised Node versions. Keep
  `engines: >=20` only with evidence; propose and document any minimum-version
  change explicitly before release.
- [ ] Reconcile `CHANGELOG.md` with the actual npm gitHead-to-main changes, then
  select the exact candidate commit. Do not list hosted accounts or ingestion as
  shipped. Keep 4F.11 signed-bundle authentication open and describe integrity
  verification accurately.
- [ ] Prepare a focused release PR that sets `package.json` to `0.11.0`, moves
  reviewed Unreleased notes into that version, and updates README, STATUS,
  ROADMAP, publishing/example docs, and CLI help where behavior changed.

### Release acceptance and publication

1. Pass `CHECKS_LEDGER.md` and all protected-main checks for the release PR.
   Include schema compatibility, teaching/flag checks, security audit, package
   consumer verification, offline examples, and reproducible report assets.
   Verify the actual tarball's public runtime/type/schema/CLI exports.
2. Address review findings, reply with fixes and evidence, resolve addressed
   threads, merge the release PR, and verify the resulting main revision and
   its raw CI logs. A green feature branch alone is not a release candidate.
3. Obtain the owner's explicit authorization to publish the concrete candidate.
   The current request does not authorize publication.
4. Dispatch `Publish to npm` from verified `main` with version `0.11.0`. Use the
   existing OIDC workflow; create no alternate token-based release path.
5. Inspect its raw log and verify registry version/dist-tags, the GitHub
   release/tag, installed CLI version, and a report generated from the installed
   tarball. If publication is partial or fails, inspect the registry before
   retrying; npm versions cannot be overwritten.

M2 accounts/ingestion, M3 hosted review screens, M4 richer analytics views,
M5 live progress/scale, and M6 launch operations stay on their own roadmap.
Assistant-ui remains parked. This plan neither publishes nor deploys a hosted
platform, and it does not mark the whole roadmap or M1 complete.

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
