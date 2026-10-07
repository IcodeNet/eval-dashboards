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
