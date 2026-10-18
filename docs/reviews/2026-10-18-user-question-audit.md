# Q&A audit: can eval-dashboards answer what real users ask?

Method: a blind asker (Opus, no repo access) wrote 120 questions for six personas. Six checkers (Fable, read-only) ran the real CLI or read the docs for 20 questions each. The lead re-ran 6 of the checkers' claims independently (smallest valid artifact, init report directory, duplicate run ids, network calls, trend chart spacing, and the SQLite build) and all six matched.

Dataset with known answers: `scripts/generate-golden-qa.ts` (12 weekly runs, ground truth in `ground-truth.json`).

## Result

| Label | Count | Meaning |
|---|---|---|
| ANSWERABLE | 53 | Proven by a command or a doc line |
| PARTIAL | 43 | Works, but a doc is missing, awkward or wrong |
| UNSUPPORTED_CLAIM | 17 | The question assumes something the tool does not do |
| GAP | 7 | A reasonable need the tool does not meet |
| UNVERIFIED | 0 | |

Every ANSWERABLE label has a command or a doc reference, and every command has an output excerpt.

## Fix plan, by user impact

1. **Docs that were wrong or missing (most PARTIAL rows).** A minimal valid artifact, a validation error table, upgrade policy, supported platforms, offline and network egress table, telemetry statement, install scripts and dependencies, provenance, signing algorithm, evidence-bundle digest recipe, duplicate run ids, how to read the trend page, CI recipes for baseline and SQLite persistence, GitLab and Jenkins, version pinning, Docker, `SECURITY.md`.
2. **Honest "not supported" answers (UNSUPPORTED_CLAIM rows).** One FAQ that says plainly what the tool does not do: run evals, schedule, host dashboards, user accounts, cloud storage, PDF (use browser print), Jira, email digests, key vault signing, encryption at rest, custom redaction patterns, secret scanning.
3. **Small features worth building.** `init` default report directory mismatch (`eval-dashboard` vs the CLI default `eval-report`), a retention log, a per-suite threshold flag or config, a target line and run notes on the trend page.

## Not planned

Hosted app, accounts and roles, VS Code extension, cloud storage, GUI wizard. These conflict with the offline, no-server design.

## Status

Done in this change: the minimal artifact and validation error table, duplicate run ids, trend page reading, CI persistence recipe (tested: `history` rebuilds from `--input`, it does not append), evidence-bundle check recipe (tested against a real bundle, including a one-byte tamper), signing guide, `faq.md`, `SECURITY.md` (private vulnerability reporting was off and is now enabled on the repository), report directory explanation.

Not done yet, each needs code: per-suite threshold flag, retention log, trend target line and run notes, `init` report directory change, GitLab and Jenkins examples.
