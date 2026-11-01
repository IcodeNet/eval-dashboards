# Eval Report

| Metric | Value |
| --- | --- |
| Run | agent-v4-2026-07-31 |
| Gate decision | passed |
| Pass rate | 97.3% |
| Passed | 73/75 |
| New failures | 0 |
| New passes | 0 |
| Baseline compatibility | warning |
| Provenance | manifest hash b33a389a |
| Dataset changelog entries | 0 |
| Rows with duration | 75/75 |
| Latency p50 | 320ms |
| Latency p95 | 640ms |
| Average row latency | 364ms |
| Max row latency | 670ms |
| Branch | feat/improve-citations |
| Commit | e4f5a6b |
| Build | build-142 |

## Cost/latency-quality frontier

### Latency-quality frontier

| Row | Suite | Quality | Latency |
| --- | --- | ---: | ---: |
| sf-0 | safety | 0.930 | 150ms |

## Diff vs previous run

No row flips detected.


## Comparison evidence and measured coverage

Paired comparison: inconclusive; change=unknown; required minimum=0; comparison groups=0; matching cases=71; confidence interval=unavailable; measurement versions or other comparison evidence are missing
Cohort: unknown. Matched cases: 71; eligible cases: 0.
Descriptive matched regressions: 0; introduced cases: 4; introduced failures: 0; removed cases: 4.
Identity matches alone do not establish comparability; inspect version eligibility before attributing changes.
Score comparisons: 0 measured pairs; 0 regressions; 71 unavailable pairs.
Cost: unknown; measured 0/75, missing 75.
Latency: sum 27270 ms; measured 75/75, missing 0.
Tokens: unknown; measured 0/75, missing 75.
Dataset and production population coverage: unknown without external denominators.
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Cohort issue: missing-suite-manifest (response-quality)
- Score response-quality: mean 0.9115 suite-score; measured 40/40, missing 0; direction unknown.
- Score safety: mean 0.93 suite-score; measured 15/15, missing 0; direction unknown.
- Score tool-use: mean 0.93 suite-score; measured 20/20, missing 0; direction unknown.

Gate diagnostic: Top failing categories: conciseness=1, groundedness=1

Gate diagnostic: Lint warning breakdown: missing-judge-model=55, missing-judge-reasoning=55, missing-agent-versioning=20, low-category-coverage=2