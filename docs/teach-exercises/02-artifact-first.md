# Exercise 02: Build a minimal eval artifact

## What this exercise teaches

1. `eval-report/v1` needs only `schemaVersion`, `run`, `suites`, and `rows` to
   load — "minimal valid" is a much lower bar than "useful."
2. `lint` never blocks a minimal artifact on missing taxonomy fields; it warns
   instead, so you can grow the artifact incrementally.
3. The artifact is a plain JSON file you can hand-author — no runner or SDK is
   required to produce a valid one.

## Question this answers

Can I produce one file that the CLI accepts as a valid eval run, with nothing
else installed?

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

Common mistakes
- Treating the taxonomy warnings as errors and trying to "fix" them here —
  they are expected at this stage; Exercise 04 adds the fields that remove
  them.
- Forgetting `mkdir -p .evals_output` first, so the heredoc write fails
  silently into the wrong directory.
- Running this outside a scratch directory, so `run-minimal.json` lands in a
  real project's working tree instead of `/tmp/...`.