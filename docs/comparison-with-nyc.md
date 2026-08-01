# Comparison With NYC/Istanbul

NYC and Istanbul are the model for this project.

| NYC/Istanbul | @icodenet/eval-reports |
| --- | --- |
| Coverage map | Eval report artifact |
| `.nyc_output` | `.evals_output` |
| `nyc report` | `eval-reports report` |
| `nyc check-coverage` | `eval-reports check` |
| `nyc merge` | `eval-reports merge` |
| HTML coverage report | Static eval dashboard |

The key design principle is the same: runners produce data, reporting tools turn that data into insight and gates.