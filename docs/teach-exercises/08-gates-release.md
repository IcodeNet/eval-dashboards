# Exercise 08: Run gates for release decisions

Goal
- Run lint, check, and report in order.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- `lint` catches shape and taxonomy issues early.
- `check` enforces quality bars.
- `report` produces human + machine output for review.

Steps

```sh
npx eval-dashboards lint --input=.evals_output
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --zero-critical
npx eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-dashboard
```

Example result
- `eval-dashboard/index.html` exists.
- `eval-dashboard/summary.json` exists.
- `check` returns a clear pass/fail outcome.
- In this early dataset stage, a failing `check` (exit code `1`) is expected and useful because it shows which gate failed.

Definition of done
- You can explain why each command runs in this order.