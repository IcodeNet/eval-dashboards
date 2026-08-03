# npm Publishing Workflow

This document explains how `@icodenet/eval-dashboards` is published to npm.

## Overview

Primary release path uses the trusted-publishing workflow:

- Trigger `.github/workflows/publish.yml` manually with the version in `package.json`
- Publishes to npm using GitHub Actions OIDC trusted publishing
- Creates GitHub release + tag (`vX.Y.Z`)
- Does not require an `NPM_TOKEN` secret

Legacy Semantic Release config remains available in `.github/workflows/release.yml` for manual experiments only. It is not run on every `main` push because `@semantic-release/npm` requires `NPM_TOKEN`, while this package is configured for trusted publishing.

## Required Secrets

### Trusted publishing

Configure the package on npm for trusted publishing from this GitHub repository and the `Publish to npm` workflow. No npm automation token is required for the primary path.

### NPM_TOKEN (legacy semantic-release only)

Only needed if running `.github/workflows/release.yml` manually:

1. Login to npm as the `@icodenet` owner
2. Go to https://www.npmjs.com/settings/tokens
3. Create an **Automation** token
4. Add it to GitHub repo secrets as `NPM_TOKEN`

## Conventional Commit Rules

Semantic Release depends on conventional commits:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `perf:` -> patch bump
- `feat!:` or `BREAKING CHANGE:` -> major bump
- `docs:` / `chore:` by default do not publish a new release unless configured

This repository also accepts ticket/initial prefixes before the type, for example:

- `[AB#272021] [BT] feat: add grouped report index`
- `[AB#272021] [BT] fix: handle missing suite manifest`

## Publish Flow

1. Update `package.json` and `CHANGELOG.md` for the intended version.
2. Merge or push the release commit to `main`.
3. Run `.github/workflows/publish.yml` manually with the version input.
4. The workflow validates, builds, publishes to npm, and creates the GitHub release.

## Local Dry Run

Use dry run to preview next release without publishing:

```bash
pnpm install
pnpm release:dry
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
| Legacy semantic-release fails with `ENONPMTOKEN` | Either use `publish.yml`, or add an `NPM_TOKEN` before running `release.yml` manually |
| Manual publish version mismatch | Ensure `package.json` version matches manual `version` input |

## Verification

After a successful release:

```bash
npm view @icodenet/eval-dashboards
npm view @icodenet/eval-dashboards version
```
