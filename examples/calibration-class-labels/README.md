# Compare four answer labels

A person assigns one of four labels to each answer. The AI judge makes one
mistake: it calls a partially answered question fully answered. Three of four
labels match, giving 75% agreement and a kappa score of 2/3. Kappa adjusts for
how often each label is used. These four synthetic examples demonstrate the
calculation; they do not establish that a real judge is reliable.

```sh
pnpm dev check --input=examples/calibration-class-labels
pnpm dev report --input=examples/calibration-class-labels --report-dir=class-report --reporter=html --reporter=json-summary
```

The check passes its declared minimum score of 0.6 and sample size of four.
Remove a person's label and the sample-size check fails. The labels are exact,
case-sensitive names. Only “fully answered” maps to Pass. The input deliberately
omits boolean judge/human verdicts; existing boolean-only artifacts still work.
See [the contract](../../docs/artifact-format.md#named-judge-and-human-labels).
This example requires version 0.12.0 or newer.
