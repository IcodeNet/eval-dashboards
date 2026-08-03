# npm Publishing Workflow

This document explains how `@icodenet/eval-dashboards` is published to npm.

## Overview

Primary release path uses Semantic Release:

- Triggered on merge/push to `main` via `.github/workflows/release.yml`
- Reads conventional commit messages to calculate next version
- Updates `CHANGELOG.md` and `package.json`
- Publishes to npm
- Creates GitHub release + tag (`vX.Y.Z`)

A legacy/manual fallback exists in `.github/workflows/publish.yml` and can be run with `workflow_dispatch`.

## Required Secrets

### NPM_TOKEN

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

## Automatic Publish Flow

1. Open PR with conventional PR title (validated by `.github/workflows/pr-title-lint.yml`)
2. Merge to `main`
3. GitHub Actions runs `.github/workflows/release.yml`
4. If release-worthy commits are present:
  - new version is computed
  - npm publish runs
  - tag and GitHub release are created

## Local Dry Run

Use dry run to preview next release without publishing:

```bash
pnpm install
pnpm release:dry
```

## Manual Fallback Publish

If needed, run `.github/workflows/publish.yml` manually from Actions:

- Provide `version` input (must match `package.json`)
- Workflow validates, runs checks, publishes to npm, creates release

The install step in this workflow supports both cases:

- lockfile present -> `pnpm install --frozen-lockfile`
- lockfile absent in ref -> fallback `pnpm install --no-frozen-lockfile`

## Troubleshooting

| Issue | Solution |
|------|----------|
| No release created on main | Ensure at least one merge commit is `feat:`, `fix:`, or `perf:` (or breaking) |
| PR title lint fails | Rename PR title to conventional format |
| npm publish fails | Verify `NPM_TOKEN` exists and has publish scope |
| Manual publish version mismatch | Ensure `package.json` version matches manual `version` input |

## Verification

After a successful release:

```bash
npm view @icodenet/eval-dashboards
npm view @icodenet/eval-dashboards version
```
