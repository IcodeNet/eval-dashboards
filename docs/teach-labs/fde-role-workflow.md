# FDE role workflow lab: artifact-first delivery loop

Concept

An FDE should operate as an evidence translator between product risk and engineering action.

Why this matters

Customers and internal teams need confidence decisions they can audit. The FDE role is not only to run tools, but to connect business risk, eval evidence, and remediation priority using a repeatable artifact loop.

Lab question

Can you run the full FDE loop and produce a confidence packet with clear next actions?

Lab outline

1. Understand the operating model
   - runner-agnostic + artifact-first
2. Learn responsibilities by delivery stage
3. Execute the end-to-end loop
4. Practice the loop on deterministic fixture artifacts

Principles

- Runner-agnostic: keep customer runner; map outputs into `eval-report/v1`.
- Artifact-first: every decision must point to report/check/history artifacts.

## Stage responsibilities and required evidence

| Stage | FDE responsibilities | Required evidence outputs |
|---|---|---|
| Customer onboarding | Integrate current runner output with `eval-report/v1`; establish stable IDs and suite boundaries | `.evals_output/*.json`, taxonomy lint output, first `summary.json` |
| Suite/rubric definition | Define suites by risk area and delivery objective; encode rubric and gate intent | `suiteManifests[]` + `rubricContracts[]` in artifact rows (see `examples/report-power-artifacts/.evals_output/run-current.json`), plus gate config/check output |
| Pre-PR gating | Run policy gates and block regressions | `check.json` with explicit failures/diagnostics + baseline ID |
| PR triage | Explain what regressed, what improved, and why | `summary.json` comparison sections (`newlyFailing`, `persistentFailures`, `disappeared`) |
| Release readiness | Produce confidence packet for decision meeting | report bundle (`index.html`, `summary.json`, `history.json`, `check.json`) |
| Post-release monitoring | Track drift and unresolved risk over time | periodic `history.json` + trend summaries + gate results |

## End-to-end task loop

Run this from a scratch directory (see `docs/teach-curriculum.md` "Exercise
rules"), not a real customer repo or this checkout: `init --write` creates
6 real files in the current directory, and every step below was verified to
run end-to-end against that fixture.

1) Onboard customer repo (no runner rewrite)

```sh
npx eval-dashboards init --preset=agent-quality --runner=node --write --playbook
# Map existing runner output to .evals_output/*.json as eval-report/v1
npx eval-dashboards lint --input=.evals_output
```

2) Define suites/rubrics and gate intent

```sh
npx eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical --json-out=eval-report/check.json
```

3) Triage failures with row-level evidence and traces

```sh
npx eval-dashboards report --input=.evals_output --reporter=html --reporter=json-summary --report-dir=eval-report
# Open eval-report/index.html and inspect failing rows and trace links (when present)
```

4) Build stakeholder confidence report

```sh
npx eval-dashboards history --input=.evals_output --out=eval-report/history.json
# Provide eval-report/index.html + summary.json + history.json + check.json together
```

5) Drive remediation loop

```sh
# after fixes, rerun customer evals to emit next run artifact
npx eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --json-out=eval-report/check.json
npx eval-dashboards report --input=.evals_output --reporter=json-summary --report-dir=eval-report
```

## Practical lab using repo fixture

Use deterministic fixture artifacts to practice the FDE loop:

```sh
./scripts/generate-report-power-artifacts.sh
```

Inspect required evidence quickly:

```sh
python3 - <<'PY'
import json
from pathlib import Path
root = Path('examples/report-power-artifacts')
summary = json.loads((root / 'report/summary.json').read_text())
check_pass = json.loads((root / 'gates/check-pass.json').read_text())
history = json.loads((root / 'report/history.json').read_text())
print('run=', summary['summary']['run']['id'])
print('baseline=', summary['comparison'].get('previousRunId'))
print('gate_passed=', check_pass['passed'])
print('history_runs=', len(history))
print('persistent_failure_ids=', [r['id'] for r in summary['comparison'].get('persistentFailures', [])])
PY
```

## Definition of done

You can state the concept in plain language, then deliver a customer-facing confidence packet with:

- gate decision,
- progress vs baseline,
- row-level failures with IDs/reasons,
- history trend context,
- clear remediation next steps tied to artifact evidence.