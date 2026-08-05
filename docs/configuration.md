# Configuration

Config locations:

- `eval-dashboards.config.ts`
- `eval-dashboards.config.js`
- `evalDashboards` in `package.json`

Example:

```ts
export default {
  input: ['.evals_output/**/*.json'],
  reportDir: 'eval-report',
  reporters: ['html', 'json-summary', 'markdown-summary', 'text'],
  gates: {
    minPassRate: 0.9,
    maxNewFailures: 0,
    zeroCritical: true,
  },
  baseline: {
    strategy: 'champion', // 'rolling' | 'champion'
    lookback: 30, // optional number of prior runs considered
  },
  publish: {
    target: 'github-pages',
    githubPages: {
      repo: 'icodenet/eval-dashboard',
      branch: 'gh-pages',
    },
  },
};
```

CLI overrides:

- `--baseline-run-id=<run-id>`: explicit baseline selection (highest priority).
- `--baseline-strategy=rolling|champion`: strategy when baseline run ID is omitted.
- `--baseline-lookback=<n>`: limit candidate prior runs considered by the strategy.

Recommended artifact layout:

- Write one file per run under `.evals_output` (for example `.evals_output/<runId>.json`).
- Preserve prior run files so `rolling` and `champion` strategies can select meaningful baselines and history commands can build trends.
- Use single-file overwrite workflows only when you do not need cross-run comparisons.