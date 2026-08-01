# @icodenet/eval-dashboards

[![npm](https://img.shields.io/npm/v/@icodenet/eval-dashboards)](https://www.npmjs.com/package/@icodenet/eval-dashboards)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

**Beautiful, themeable HTML dashboards, quality gates, and publishing for AI agent eval runs.**

Bring your own eval runner — emit a standard JSON artifact, then use `eval-dashboards` to generate reports, enforce quality gates, track history, and publish a static dashboard. No platform sign-up, no vendor lock-in.

> Inspired by [NYC/Istanbul](https://istanbul.js.org/) for code coverage. Same mental model, built for LLM and agent evals.

---

## Screenshots

<table>
  <tr>
    <td><strong>Default theme</strong></td>
    <td><strong>Dark theme</strong></td>
  </tr>
  <tr>
    <td><img src="docs/images/report-default.png" alt="Default theme dashboard" width="480"></td>
    <td><img src="docs/images/report-dark.png" alt="Dark theme dashboard" width="480"></td>
  </tr>
</table>

---

## Quick start

```sh
pnpm add -D @icodenet/eval-dashboards
```

```sh
# 1. Run your evals and emit a JSON artifact
my-eval-runner --output=.evals_output/run.json

# 2. Generate an HTML dashboard
eval-dashboards report --input=.evals_output --reporter=html

# 3. Enforce quality gates (non-zero exit if gates fail)
eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0

# 4. Publish to GitHub Pages
eval-dashboards publish --target=github-pages --repo=owner/repo
```

---

## CLI commands

| Command | Description |
|---|---|
| `eval-dashboards report` | Generate HTML, text, Markdown, or JSON-summary dashboards |
| `eval-dashboards check` | Enforce pass-rate, new-failure, and severity gates |
| `eval-dashboards publish` | Publish dashboard to `dir`, `github-pages`, Azure Static Web Apps, or Azure Storage |
| `eval-dashboards history` | Build a history JSON trend file from discovered artifacts |
| `eval-dashboards merge` | Merge multiple artifacts into one |
| `eval-dashboards init` | Print a starter `eval-dashboards.config.ts` |

---

## Themes

Three built-in themes. Switch with `--theme` or set in config:

```sh
eval-dashboards report --theme=dark
eval-dashboards report --theme=minimal
```

Bring your own brand colours by passing CSS variable overrides in `eval-dashboards.config.ts`:

```ts
export default {
  theme: {
    name: 'default',
    variables: {
      '--banner-bg': '#1a1a2e',
      '--accent':    '#e94560',
      '--pass':      '#0f3460',
    },
  },
};
```

---

## Artifact format

Your eval runner emits `eval-report/v1` JSON. Fields are runner-agnostic:

```ts
{
  schemaVersion: 'eval-report/v1',
  run: { id, generatedAt, project, branch, commit, buildId },
  suites: [{ id, total, passed, failed }],
  rows: [{
    id, suite, passed,
    kind?,          // 'deterministic' | 'agent' | 'llm-judge' | 'human-review'
    name?, input?, output?, expected?,
    turns?,         // ConversationTurn[] — multi-turn conversations
    toolCalls?,     // ToolCall[] — agent tool sequences
    axisScores?,    // Record<string, number> — per-rubric-axis scores
    judgeModel?, judgeVerdict?, judgeReasoning?,
    severity?, category?, reason?,
    durationMs?,
  }],
  suiteManifests?,  // dataset/rubric versioning + blocking gate thresholds
}
```

Full schema: [docs/artifact-format.md](docs/artifact-format.md)

---

## Configuration

```ts
// eval-dashboards.config.ts
export default {
  input:     ['.evals_output/**/*.json'],
  reportDir: 'eval-dashboard',
  reporters: ['html', 'json-summary'],
  theme:     'dark',
  locale:    'en-GB',
  gates: {
    minPassRate:    0.9,
    maxNewFailures: 0,
    zeroCritical:   true,
  },
};
```

---

## Vitest adapter

```ts
// vitest.config.ts
import VitestEvalReporter from '@icodenet/eval-dashboards/vitest-reporter';

export default defineConfig({
  test: {
    reporters: [new VitestEvalReporter({ outDir: '.evals_output' })],
  },
});
```

See [examples/vitest-evals/](examples/vitest-evals/) for a runnable example.

---

## Documentation

- [Artifact format](docs/artifact-format.md)
- [Configuration](docs/configuration.md)
- [Reporters](docs/reporters.md)
- [Gates](docs/gates.md)
- [Publishing](docs/publishing.md)

---

## License

MIT © [Byron Thanopoulos](mailto:byronth@gmail.com)

- [Comparison with NYC/Istanbul](docs/comparison-with-nyc.md)