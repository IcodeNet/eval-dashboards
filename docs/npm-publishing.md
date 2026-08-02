# npm Publishing Workflow

This document explains how to publish `@icodenet/eval-dashboards` package to npm using GitHub Actions.

## Overview

The npm publishing workflow:
- Triggers automatically when a version tag (e.g., `v0.2.0`) is pushed to GitHub
- Verifies the version in `package.json` matches the tag
- Runs full CI (typecheck, test, build)
- Publishes the package to npm as public
- Creates a GitHub Release with release notes from CHANGELOG.md

## Setup: Configure NPM_TOKEN Secret

Before publishing, configure one secret in the GitHub repository:

### Create an npm Access Token

1. Login to npm as the `@icodenet` organization owner
2. Go to https://www.npmjs.com/settings/tokens
3. Click "Generate New Token" → "Automation" type
4. Scopes: `read:user`, `publish:org`, `write:registry`
5. Copy the token

### Add NPM_TOKEN to GitHub

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: (paste the npm access token)

## Publishing a Release

### Step 1: Prepare package.json and CHANGELOG.md

On a feature branch, update:

**package.json** — Bump version (semantic versioning):
```json
{
  "version": "0.2.0"
}
```

**CHANGELOG.md** — Add release notes:
```markdown
## [0.2.0]

### Added

- Feature 1
- Feature 2

### Fixed

- Bug fix 1
```

Commit and merge to `main` via PR.

### Step 2: Create and Push Version Tag

From `main` branch:

```bash
# Pull latest main
git pull origin main

# Create the version tag
git tag v0.2.0

# Push the tag to GitHub (triggers publish workflow)
git push origin v0.2.0
```

### Step 3: Monitor Workflow

1. Go to GitHub Actions tab
2. Find the "Publish to npm" workflow run
3. Monitor logs for:
   - Version verification ✓
   - Tests pass ✓
   - Build succeeds ✓
   - npm publish ✓
   - GitHub Release created ✓

Once complete, the package is live on npm:
```bash
npm view @icodenet/eval-dashboards@0.2.0
```

## Semantic Versioning

Follow [Semantic Versioning 2.0.0](https://semver.org/):

| Type | Version | When |
|------|---------|------|
| **MAJOR** | 1.0.0 → 2.0.0 | Breaking schema or CLI changes |
| **MINOR** | 0.1.0 → 0.2.0 | New features, backward compatible |
| **PATCH** | 0.2.0 → 0.2.1 | Bug fixes only |

Current version strategy:
- `0.x.x` — Active development, API may change with MINOR bumps
- `1.0.0` — First stable release, semantic versioning strict

## Release Notes in CHANGELOG.md

Format your release notes to be automatically extracted by the workflow:

```markdown
## [0.2.0]

### Added

- New feature description
- Another new feature

### Changed

- Modified behavior or API

### Fixed

- Bug fix description

### Deprecated

- Deprecated feature (if any)

## [0.1.0]

...previous release...
```

The workflow extracts content between `## [0.2.0]` and the next version header (or EOF).

## Verify Publication

After the workflow completes:

```bash
# Check npm registry
npm view @icodenet/eval-dashboards@0.2.0

# Install the published version
npm install @icodenet/eval-dashboards@0.2.0

# Run the CLI
npx eval-dashboards --version
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Version mismatch" error | Verify `package.json` version matches tag exactly (tag `v0.2.0` = version `0.2.0`) |
| "npm publish" fails | Check NPM_TOKEN secret is set and has `publish:org` + `write:registry` scopes |
| No GitHub Release created | Ensure `CHANGELOG.md` has section `## [0.2.0]` matching the version |
| Workflow runs but doesn't trigger | Ensure you pushed the **tag**, not just a commit: `git push origin v0.2.0` |

## Examples

### Patch Release (0.1.1)

```bash
# Make fixes on feature branch
# Update package.json: "version": "0.1.1"
# Update CHANGELOG.md with [0.1.1] section
# Merge to main via PR

# Create tag
git tag v0.1.1
git push origin v0.1.1
```

### Minor Release (0.2.0)

```bash
# Add features on feature branch
# Update package.json: "version": "0.2.0"
# Update CHANGELOG.md with [0.2.0] section (Added, Changed, Fixed)
# Merge to main via PR

# Create tag
git tag v0.2.0
git push origin v0.2.0
```

### Pre-release (0.2.0-beta.1)

```bash
# For experimental releases
git tag v0.2.0-beta.1
git push origin v0.2.0-beta.1
# Workflow detects `-` and marks GitHub Release as pre-release
```

## Next Steps

- Teams can now install via npm: `npm install @icodenet/eval-dashboards`
- Create production-ready GitHub Actions + Azure DevOps CI/CD templates for eval runs
- Announce on npm, Reddit, HN, AI communities
