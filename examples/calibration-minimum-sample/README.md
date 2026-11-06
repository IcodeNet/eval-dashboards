# Minimum labelled calibration sample

In source after 0.11.0, run from the repository root:

```sh
pnpm dev check --input=examples/calibration-minimum-sample
```

The two synthetic paired labels meet `minCalibrationRows: 2` and
`minJudgeAgreementRate: 1`. A paired false/false label counts too: agreement
means the judge and human match, rather than both choosing a passing answer.

Removing either human verdict leaves one eligible pair, so the minimum fails
even though the remaining observed agreement is 100%. Unlabelled rows and
one-sided labels do not count.

Two rows make this example easy to run; they do not establish production
reliability. Choose a sample requirement for your task, class coverage and
uncertainty needs. Calibration preflight applies the declared minimum to each
matching judge separately. A minimum count does not prove statistical
independence or balanced coverage.
