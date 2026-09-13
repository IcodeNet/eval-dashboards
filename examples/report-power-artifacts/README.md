# report-power-artifacts

Concrete, repository-tracked artifacts that demonstrate report power end-to-end from deterministic fixture data.

## Regenerate

```sh
./scripts/generate-report-power-artifacts.sh
```

This command first regenerates `examples/screenshot-fixture/.evals_output` from source fixture code, then copies those run files into `examples/report-power-artifacts/.evals_output` and regenerates all tracked outputs below.

## Open these artifacts locally

- **History trends**: `examples/report-power-artifacts/report/history.json`
- **Progress over runs**: `examples/report-power-artifacts/report/summary.json` (`summary` + `comparison`)
- **Gate outcomes**:
  - pass case: `examples/report-power-artifacts/gates/check-pass.json`
  - fail case: `examples/report-power-artifacts/gates/check-fail.json`
- **Row-level/detail analysis**:
  - structured details: `examples/report-power-artifacts/report/summary.json` (`comparison.persistentFailures`, `comparison.disappeared`)
  - human-readable dashboard: `examples/report-power-artifacts/report/index.html`
  - markdown snapshot: `examples/report-power-artifacts/report/summary.md`

## Notes

- Inputs are kept in `examples/report-power-artifacts/.evals_output/` for self-contained local inspection.
- Strict gate failure is expected for the `check-fail.json` artifact (`--min-pass-rate=0.99`).
