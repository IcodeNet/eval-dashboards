# Configuration

Planned config locations:

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
  publish: {
    target: 'github-pages',
    githubPages: {
      repo: 'icodenet/eval-dashboard',
      branch: 'gh-pages',
    },
  },
};
```