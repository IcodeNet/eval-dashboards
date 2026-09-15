# Exercise 02: Build a minimal eval artifact

Goal
- Create one valid `eval-report/v1` JSON file.
- Validate it with `eval-dashboards lint`.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".
- Finish Exercise 01 (foundations).

Why this matters
- The artifact is the contract.
- If the artifact is valid, every report/gate command can work.

Steps
1) Create a minimal artifact.

```sh
mkdir -p .evals_output
cat > .evals_output/run-minimal.json <<'EOF'
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "local-minimal-001", "generatedAt": "2026-09-13T00:00:00.000Z" },
  "suites": [{ "id": "quality", "name": "Quality", "total": 1, "passed": 1, "failed": 0 }],
  "rows": [{ "id": "case-001", "suite": "quality", "passed": true }]
}
EOF
```

2) Validate it.

```sh
npx eval-dashboards lint --input=.evals_output
```

Example result
- `lint` exits `0`.
- You may see taxonomy warnings at this stage, for example:

```text
Eval taxonomy lint passed with warnings (3 warning(s), 0 error(s)):
WARNING [missing-kind] ...
WARNING [missing-severity] ...
WARNING [missing-category] ...
```

- No schema-breaking errors.

Definition of done
- File exists at `.evals_output/run-minimal.json`.
- `eval-dashboards lint` succeeds.