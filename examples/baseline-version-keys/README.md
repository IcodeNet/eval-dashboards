# Record what changed in a comparison

Both runs answer the same synthetic question. Their dataset, rubric, prompt,
tool contract and configuration versions match. The candidate intentionally
uses another model, and records why in `comparisonTreatments.modelDigest`.

```sh
pnpm dev check --input=examples/baseline-version-keys --json-out=.tmp/version-check.json
pnpm dev report --input=examples/baseline-version-keys --report-dir=version-report --reporter=html --reporter=json-summary
```

The check passes and records the model difference as a planned experiment
change. Remove the candidate's `comparisonTreatments` entry, then rerun: it
fails because a blocking test group's recorded model changed without an
explanation. An experiment name alone does not declare an intended change.

The strings here are synthetic version identifiers. In real runs, emit stable
version IDs or hashes from your runner. Do not put secrets or raw configuration
in these fields. Missing values stay unknown; declaring an experiment cannot
fill in an unrecorded value or waive dataset/rubric changes. This metadata does
not prove that an experiment is well controlled or establish a model's quality.
See [the contract](../../docs/artifact-format.md#optional-baseline-version-keys).
Requires version 0.12.0 or newer.
