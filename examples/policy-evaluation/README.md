# Complete policy evaluation

From repository source, run:

```sh
pnpm exec tsx examples/policy-evaluation/run.ts
```

The synthetic answer passes its ordinary gates, but complete policy fails because
its blocking judge suite has no matching calibration evidence. This is the same
policy function used by CLI `check` and `report`. No provider, server or database
is required. This example was verified against the 0.11.0 source candidate
during release preparation on 2026-11-01.

Applications import `evaluateReportPolicy` from `@icodenet/eval-dashboards`
starting with 0.11.0; check npm for current availability. Supply validated artifacts, the resolved gate config,
and optional validated waiver register, baseline gate config, calibration reports
and tier budget. Pass `result.gateDecision`, `result.gateConfig.paired` and
`result.gateConfig.statistical` to the matching rendering context fields for
those same artifacts, keeping the comparison settings consistent. Rendered
bootstrap context uses raw rows; with an active waiver, legacy bootstrap gate
diagnostics contain the waiver-adjusted interval instead. `checkGates` remains the lower-level ordinary gate evaluator.

The caller selects the current run, baseline and tier, and scopes calibration
evidence to the same project and permitted tenant. The evaluator performs no
loading, authentication, ingestion or publication. For tiered evaluation, apply
`filterReportByTier` to all input reports before selection and use the matching
`prTierBudget.tier`; a budget alone does not filter ordinary gates. `now` controls
waiver expiry; calibration freshness uses the current artifact timestamp, with
`now` as fallback. Missing cost stays reported as missing coverage.
