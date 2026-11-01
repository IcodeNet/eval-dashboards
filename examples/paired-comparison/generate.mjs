// Synthetic artifacts for demonstrating comparison policy, not a model benchmark or eval runner.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('.evals_output', import.meta.url)));
await mkdir(output, { recursive: true });
for (const [id, generatedAt] of [['previous', '2026-10-30T00:00:00Z'], ['current', '2026-10-31T00:00:00Z']]) {
  const artifact = {
    schemaVersion: 'eval-report/v1',
    run: { id, project: 'paired-comparison-demo', generatedAt },
    suites: [{ id: 'outcomes', total: 100, passed: 100, failed: 0 }],
    suiteManifests: [{ name: 'outcomes', target: 'custom', datasetSource: 'synthetic', datasetVersion: 'demo-1', rubricVersion: 'outcome-1', graderVersion: 'assertions-1',
      graders: ['deterministic-assertions'], riskArea: 'response-quality', scoreScale: { min: 0, max: 1 }, scoreDirection: 'higher-is-better', gate: { mode: 'report-only', thresholds: {} } }],
    rows: Array.from({ length: 100 }, (_, index) => ({ id: `case-${String(index).padStart(3, '0')}`, suite: 'outcomes', kind: 'deterministic', severity: 'none',
      category: 'synthetic-outcome', input: `case-${index}`, output: 'pass', expected: 'pass', passed: true, score: 1 })),
  };
  await writeFile(resolve(output, `${id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(output);
