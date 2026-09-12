# CLI help snapshots

These files are exact snapshots of live CLI `--help` output.

- `report.txt`
- `check.txt`
- `publish.txt`
- `import.txt`
- `teach.txt`
- `init.txt`

Verification rule:

- `scripts/verify-cli-init-and-completion.sh` compares each snapshot to live command output.
- Update snapshots when command help intentionally changes.
