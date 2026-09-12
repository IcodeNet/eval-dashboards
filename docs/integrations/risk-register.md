# Integration risk register

This register is required for interoperability docs changes.

| Risk | Owner | Trigger | Mitigation |
|---|---|---|---|
| Runtime/version mismatch | Integration maintainer | Import/export shape changes after tool or SDK upgrade | Pin tested versions in integration docs, add fixture-based adapter tests, fail fast on unknown shapes with actionable errors. |
| Python sidecar dependency drift | Platform/DevEx owner | Node-first CI lacks Python env or package set required by external evaluator | Keep conversion boundary at JSON artifacts; document Python setup separately; run conversion in isolated job/container and pass only `eval-report/v1` artifact downstream. |
| Schema drift from external outputs | Schema owner | New provider fields replace or rename pass/fail signals | Use explicit mapping layer; keep `eval-report/v1` as stable contract; add compatibility checks in `lint` and adapter tests before rollout. |
| Cloud coupling vs offline-first | Docs + release owner | Docs/examples assume hosted dashboards or always-on SaaS traces | Maintain `--target=dir` and local report flow as canonical; treat cloud publish and trace links as optional add-ons; include local-only examples in every guide. |
| Synthetic-overfitting | Eval program owner | Repeated gains on synthetic suites without production-sample validation | Split suites by dataset source, require production-sample suites before release gates, and track regressions by suite/risk area in history trends. |

## Usage rule

Do not mark a new integration page complete unless it links to this register and addresses applicable risks.
