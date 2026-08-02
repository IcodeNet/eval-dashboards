# Contributing to @icodenet/eval-dashboards

Welcome! We're excited you're interested in contributing to the standardized evaluation reporting layer for AI agents and LLMs.

## Code of Conduct

Please read our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **pnpm** (install via `npm install -g pnpm` or `npm install --global pnpm`)
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/icodenet/eval-dashboards.git
cd eval-dashboards

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run TypeScript check
pnpm typecheck

# Build package
pnpm build
```

### Development Workflow

1. **Pick an issue** from [GitHub Issues](https://github.com/icodenet/eval-dashboards/issues) or open a new one for discussion
2. **Create a branch** following the pattern: `feature/ISSUE-ID-short-description` or `fix/ISSUE-ID-short-description`
3. **Make changes** in `src/` directory
4. **Write or update tests** in `test/` directory
5. **Run `pnpm test`** to verify everything passes
6. **Run `pnpm typecheck`** to check TypeScript
7. **Run `pnpm build`** to verify bundling works
8. **Open a pull request** against `main` with a clear description

### Project Structure

```
src/
  cli/          CLI entry point and commands
  config/       Configuration loading
  gates/        Quality gate enforcement
  history/      Run history and comparison logic
  io/           Report discovery and I/O
  model/        eval-report/v1 schema and validation
  publish/      Publishing adapters (GitHub Pages, Azure, etc.)
  reporters/    HTML, JSON, Markdown report generation
  utils/        Formatting and utility functions

test/           Vitest test files (one-to-one with src/)
examples/       Working examples for runners (Vitest, Jest, Node, etc.)
docs/           Product documentation (taxonomy, roadmap, etc.)
schemas/        JSON Schema for eval-report/v1
```

### Key Concepts

- **eval-report/v1**: The standardized evaluation artifact format (JSON Schema). See [docs/artifact-format.md](./docs/artifact-format.md) and [schemas/eval-report-v1.schema.json](./schemas/eval-report-v1.schema.json).
- **Taxonomy**: The vocabulary for describing evaluation rows (kind, severity, category, evidence fields). See [docs/taxonomy.md](./docs/taxonomy.md).
- **Suite Manifest**: Metadata about a test suite including gate policies and dataset/rubric versioning. See [docs/artifact-format.md#suite-manifest](./docs/artifact-format.md#suite-manifest).
- **Runner-agnostic**: We don't depend on any specific eval harness or LLM vendor. Examples show how to emit artifacts from Vitest, Jest, plain Node, etc.

## Making Changes

### When to add tests

- **Bug fixes**: Add a regression test that fails before the fix and passes after
- **New features**: Add tests covering the happy path and error cases
- **Refactors**: Update tests to verify the refactored behavior still works

Run targeted tests with:

```bash
# Run tests in a specific file
pnpm test -- baseline-compatibility

# Run a specific test by name
pnpm test -- --grep "persistentFailures"
```

### When to update documentation

- **Schema changes**: Update [docs/artifact-format.md](./docs/artifact-format.md) and the JSON Schema comments
- **Taxonomy changes**: Update [docs/taxonomy.md](./docs/taxonomy.md) with new field definitions and examples
- **CLI changes**: Update [docs/configuration.md](./docs/configuration.md) and example READMEs
- **New examples**: Add to `examples/` directory with comprehensive README

### Linting and formatting

Currently, we rely on TypeScript strict mode for type safety. In the future we may add ESLint/Prettier; for now:

- **Use strict types** — avoid `any`
- **Quote strings consistently** — double quotes
- **Organize imports** — node builtins first, then external, then local

### Commit messages

Follow this format:

```
type: description

Optional longer explanation of the change, why it matters,
and any breaking changes or migration steps.

Closes #123
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Example:

```
feat: add persistent failure detection to history module

Add analyzeRowStability() function to classify rows as stable, flaky,
or persistent-failure based on pass/fail history across multiple runs.
Also export RowStability type and RowTrend for callers.

Closes #456
```

## Submitting a Pull Request

1. **Check the ROADMAP** ([docs/ROADMAP.md](./docs/ROADMAP.md)) for current priorities
2. **Reference an issue** — link to GitHub issue in PR description
3. **Keep scope focused** — one feature or fix per PR
4. **Update STATUS.md** — mark items as done when code + tests exist
5. **All tests pass** — run `pnpm test` before pushing
6. **TypeScript clean** — run `pnpm typecheck` before pushing
7. **Build succeeds** — run `pnpm build` before pushing

### Example PR Description

```markdown
## Summary

Add explicit baseline selection by run ID to `eval-dashboards check` command.

## Changes

- Added `--baseline-run-id` CLI flag to specify baseline for comparison
- Updated `compareRuns()` to accept explicit baseline run
- Added integration test for baseline selection

## Closes

Closes #789

## Testing

```bash
pnpm test -- baseline
pnpm dev check --baseline-run-id my-run-001
```
```

## Reporting Issues

**Found a bug?** Please open an issue with:

- Clear title and description
- Steps to reproduce (if applicable)
- Expected vs. actual behavior
- Environment (Node version, OS, pnpm version)
- Relevant code or artifact examples

**Have a feature request?** Please open an issue with:

- Clear title
- Motivation: Why is this useful?
- Proposed API/UX (if applicable)
- Alternative approaches you've considered

## Adoption & Impact

We measure success by:

1. **External runners discovering the project** (GitHub stars, discussions)
2. **Runners emitting taxonomy-complete artifacts** (schema adoption)
3. **External projects citing the JSON Schema** (standardization impact)
4. **Ecosystem adoption** (npm downloads, integrations)

Help us grow these metrics by:

- Sharing the project with eval teams and frameworks
- Creating runner examples for popular eval harnesses
- Writing blog posts or talks about standardized eval reporting

## Releasing a New Version

**Maintainers only:** See [docs/npm-publishing.md](./docs/npm-publishing.md) for the full release workflow.

Quick summary:

1. Update `package.json` version (semantic versioning)
2. Update `CHANGELOG.md` with release notes
3. Merge to `main` via PR
4. Create a git tag: `git tag v0.2.0 && git push origin v0.2.0`
5. GitHub Actions automatically publishes to npm

The workflow requires `NPM_TOKEN` secret configured in GitHub repository settings.
- Opening issues for UX improvements based on real usage

## Questions?

- Read the [README.md](./README.md) for overview and quick start
- See [docs/taxonomy.md](./docs/taxonomy.md) for evaluation vocabulary
- Check [docs/examples.md](./docs/examples.md) for runner integration patterns
- Open a discussion on [GitHub Discussions](https://github.com/icodenet/eval-dashboards/discussions)

Thank you for contributing! 🎉
