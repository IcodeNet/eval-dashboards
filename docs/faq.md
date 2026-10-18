# FAQ: what eval-dashboards does and does not do

eval-dashboards reads the result files your eval runner writes. It turns them into reports, quality gates and history. It works offline and has no server. This page answers the questions people ask most, including the ones where the answer is "no".

## What it does not do

| You might expect | What is true | What to do instead |
|---|---|---|
| It runs my evals | No. It never calls a model or runs a test. | Run evals with your own runner, then point `eval-dashboards` at the output. |
| It re-runs only the failed cases | No, because it does not run evals. | Read the newly failing rows from `summary.json` and feed them to your runner. |
| It runs on a schedule | No. | Schedule your runner in CI (a cron trigger), then run `check` as a step. |
| A hosted web app, login, or a cloud account to store runs | No. Reports are static HTML files. | Publish the files to GitHub Pages, Azure storage or a folder with `publish`. |
| User accounts and permissions | No. There is no user concept. | Use your repository's branch protection and `CODEOWNERS` on the waiver file to control who can approve changes. |
| An audit log of who ran each command | No. | Your CI system's logs record who ran what. The bypass log records which escape hatches were used. |
| It estimates dollar cost from tokens | No. | Write `usage.costUsd` on each row in your runner. The reports total what you supply. |
| A side-by-side diff of two runs' model outputs | No. Reports compare pass and fail between runs. | Compare the `output` text in two artifacts with a diff tool. |
| A PDF export | No. | Open `index.html` in a browser and use Print, then Save as PDF. |
| Email digests or Jira tickets | Not built in. `check --notify` can send Slack, Teams or email alerts when a gate fails. | Point a Jira or Zapier webhook at a `--notify` webhook. |
| Signing with a key in Azure Key Vault or a hardware module | No. Signing uses Sigstore keyless signing in CI. | See "Signing a check result" in the [gates guide](./gates.md). |
| Custom redaction patterns, or scanning for API keys | No. Redaction removes whole fields, not text patterns. | Keep secrets out of free-text fields in your runner. See "What `--redact` removes" in the [publishing guide](./publishing.md). |
| Encryption of the SQLite history file | No. | Use disk or volume encryption. |
| A VS Code extension or a setup wizard | No. | `eval-dashboards init --write` writes a starter project. |

## Platforms and network

- **Node:** version 20 or newer. The SQLite history store needs 22.5 or newer.
- **Operating system:** it is plain Node with no native add-ons. It is tested on Linux. Windows and macOS are not tested by the project, so report any problem you find.
- **Network:** `report`, `check`, `lint`, `history`, `merge`, `import`, `evidence-export` and `evidence-verify` make no network calls, so they work on an air-gapped machine. Only these send data out, and only when you ask: `publish` (GitHub, Azure), `check --notify` (your webhook or SMTP server), and keyless signing in CI (Sigstore).
- **Telemetry:** none. The package does not report usage.

## Install and upgrade

- The package has one required runtime dependency, `@octokit/rest`, and one optional one, `nodemailer` (email alerts). The published package has no install scripts, so installing it runs no code.
- While the version is below 1.0, a minor version can include breaking changes. Pin an exact version in CI, for example `npx @icodenet/eval-dashboards@0.9.0 ...`, or set `package-spec` in the GitHub Action.
- History is rebuilt from your artifact files each time you run `history`, so an upgrade never needs a history migration.

## Releases

Releases are published from GitHub Actions with npm trusted publishing, and npm records a provenance attestation for each one. To check, run `npm view @icodenet/eval-dashboards@<version> dist.attestations`.
