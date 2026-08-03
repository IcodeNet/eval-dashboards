# Repo Hardening

**Purpose:** Open-source and trust hygiene for `@icodenet/eval-dashboards`.  
**Use:** Copy this file into `docs/REPO-HARDENING.md`, then ask an agent to implement items one phase at a time.  
**Related:** `docs/ROADMAP.md`, `docs/STATUS.md`, `AGENTS.md`, `docs/PROPOSITION-AND-TAXONOMY.md`

This doc covers **repo polish and first impressions**. It does **not** replace schema/taxonomy work (see proposition docs) or the STATUS remaining feature list.

---

## Goals

1. A newcomer can go from clone → HTML report in under five minutes.
2. Every PR is checked by CI (typecheck, test, build).
3. Humans and agents know how to contribute safely.
4. Releases are trackable; security expectations are explicit.
5. The README matches the real product pitch (schema + taxonomy + reports).

---

## Phase H1 — CI and truth on main

### H1.1 GitHub Actions CI

Add `.github/workflows/ci.yml` (or equivalent) that on pull request and push to `main`:

- `pnpm install` (use frozen lockfile if appropriate)
- `pnpm typecheck` (or `tsc --noEmit`)
- `pnpm test`
- `pnpm build`

Optional later: example smoke job (`report` + `check` on `examples/basic-json`).

**Acceptance**

- [ ] Workflow file exists and runs on PRs
- [ ] Main is green
- [ ] README can link a CI badge

### H1.2 STATUS discipline

- [ ] `docs/STATUS.md` only marks items done when code + tests exist
- [ ] No STATUS checkboxes flipped in docs-only PRs

---

## Phase H2 — README first five minutes

### H2.1 One-command (or short) demo

Document in README:

```sh
pnpm add -D @icodenet/eval-dashboards   # or pnpm install in this repo
# from repo root, using an example artifact path that actually exists:
pnpm exec eval-dashboards report --input=examples/basic-json --reporter=html
# open the generated HTML path documented in the command output / docs
```

Adjust paths/commands to match the real package and examples.

**Acceptance**

- [ ] Steps work on a clean clone
- [ ] Output path is explicit
- [ ] No API keys required for the demo path

### H2.2 Screenshots

- [ ] Capture default theme and dark theme of a real generated report
- [ ] Store under `docs/images/` (or existing images path)
- [ ] Embed in README (replace empty screenshot table if present)

### H2.3 Badges and agent pointer

- [ ] CI badge
- [ ] License badge
- [ ] npm version badge (after publish)
- [ ] One line: **Agents:** start at [`AGENTS.md`](../AGENTS.md)

### H2.4 Pitch alignment

- [ ] README lead matches schema + taxonomy proposition (not dashboard-only)
- [ ] Link `docs/artifact-format.md`, and `docs/taxonomy.md` when it exists
- [ ] Link `docs/ROADMAP.md` / STATUS for contributors

---

## Phase H3 — Contributor and security surface

### H3.1 CONTRIBUTING.md

Short file covering:

- Prerequisites (Node 20+, pnpm)
- `pnpm install` / `pnpm test` / `pnpm check`
- Branch + PR flow
- **AI-assisted PRs must follow `AGENTS.md`** and the PR template
- Point at `docs/STATUS.md` for work items

### H3.2 SECURITY.md

- How to report vulnerabilities (email or GitHub private advisory)
- Do not file public issues for sensitive reports
- Policy: no secrets in fixtures; publish adapters must not log tokens

### H3.3 Issue templates

Under `.github/ISSUE_TEMPLATE/` (or GitHub form templates):

- Bug report (version, command, minimal artifact if possible)
- Feature request
- Optional: taxonomy-gap (missing field / unclear docs)

### H3.4 PR template

Ensure `.github/PULL_REQUEST_TEMPLATE.md` exists (from agent primitives). If missing, restore it.

---

## Phase H4 — Release hygiene

### H4.1 CHANGELOG.md

- Adopt [Keep a Changelog](https://keepachangelog.com/) style
- Start from current version (e.g. 0.1.0) with a brief Initial entry
- Update on every release

### H4.2 npm publish readiness

When API is stable enough for 0.1.x:

- [ ] `package.json` description + keywords reflect eval-report, taxonomy, quality-gates, agent-evals
- [ ] `files` field publishes dist, README, docs as intended
- [ ] Publish workflow or documented manual publish steps
- [ ] npm version badge on README

### H4.3 GitHub Action for adopters

- [ ] Example workflow under `examples/github-actions/` is copy-paste ready: install → report → check
- [ ] Documented in README or `docs/examples.md`

---

## Phase H5 — Trust defaults (docs + examples)

- [ ] Document HTML escaping guarantee (user/model text)
- [ ] Examples use synthetic data only; note “no PII” in example READMEs
- [ ] Publish docs state dry-run and no secret logging
- [ ] Naming: no residual `@icodenet/eval-reports` / `eval-reports` where this package is meant

---

## Suggested agent prompts

### Implement H1 (CI)

```text
Read AGENTS.md and docs/REPO-HARDENING.md Phase H1.
Add a GitHub Actions workflow that runs pnpm typecheck, test, and build on pull requests and pushes to main.
Use the package manager and scripts already defined in package.json.
Do not mark unrelated STATUS items done.
```

### Implement H2 (README demo + screenshots)

```text
Read AGENTS.md and docs/REPO-HARDENING.md Phase H2.
Update the README with a working demo path using existing examples, CI/license badges if CI exists, an Agents link to AGENTS.md, and the schema/taxonomy-oriented pitch.
If screenshots cannot be captured in this environment, add clear placeholders under docs/images/ and document the exact capture steps for a human.
```

### Implement H3 (CONTRIBUTING + SECURITY + issues)

```text
Read AGENTS.md and docs/REPO-HARDENING.md Phase H3.
Add CONTRIBUTING.md, SECURITY.md, and GitHub issue templates as specified.
Keep them short. Link AGENTS.md for AI-assisted contributions.
```

### Implement H4 (CHANGELOG + npm metadata)

```text
Read AGENTS.md and docs/REPO-HARDENING.md Phase H4.
Add CHANGELOG.md for the current version. Refresh package.json description and keywords for discoverability (eval-report, taxonomy, quality gates, agent/llm evals). Do not publish to npm unless explicitly asked.
```

---

## Priority order

| Order | Phase | Why |
|-------|--------|-----|
| 1 | H1 CI | Trust on every PR |
| 2 | H2 README demo + pitch | Adoption and clarity |
| 3 | H3 CONTRIBUTING / SECURITY / issues | Human + agent contribution |
| 4 | H4 Changelog + npm metadata | Releases and discovery |
| 5 | H5 Trust defaults | Safety and consistency |

Work **one phase per agent session** when possible. Prefer green CI before a wide social announcement.

---

## Out of scope here

- Implementing `eval-report` JSON Schema (see `PROPOSITION-AND-TAXONOMY.md` Phase A)
- Full HTML taxonomy redesign (Phase C)
- New publish cloud targets
- Building a hosted product

Those stay on STATUS / proposition track.
