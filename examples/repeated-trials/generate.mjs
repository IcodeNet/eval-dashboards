// Synthetic counts only: this creates artifact fixtures, not an evaluation harness.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = resolve(process.argv[2] ?? fileURLToPath(new URL('.evals_output', import.meta.url)));
await mkdir(output, { recursive: true });
for (const [id, generatedAt, passes] of [['previous', '2026-10-31T00:00:00Z', 80], ['current', '2026-11-01T00:00:00Z', 95]]) {
  const rows = ['declared', 'unknown'].map(id => ({ id, suite: 'quality', kind: 'deterministic', severity: 'none', category: 'synthetic-repeat',
    input: id, expected: 'pass', passed: true, repeated: { runs: 100, passes, aggregation: 'majority',
      ...(id === 'declared' ? { samplingDesign: 'fixed-independent' } : {}) } }));
  const artifact = { schemaVersion: 'eval-report/v1', run: { id, project: 'repeated-trial-demo', generatedAt }, rows,
    suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
    suiteManifests: [{ name: 'quality', target: 'custom', datasetSource: 'synthetic', datasetVersion: 'demo-1', rubricVersion: 'outcome-1', graderVersion: 'assertions-1',
      graders: ['deterministic-assertions'], riskArea: 'response-quality', gate: { mode: 'report-only', thresholds: {} } }] };
  await writeFile(resolve(output, `${id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(output);
