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


Gate diagnostic: Top failing categories: conciseness=1, groundedness=1

Gate diagnostic: Lint warning breakdown: missing-judge-model=55, missing-judge-reasoning=55, missing-agent-versioning=20, low-category-coverage=2