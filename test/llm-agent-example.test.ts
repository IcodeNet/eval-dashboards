import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';

it('emits valid local-agent reports with calibration suite summaries matching their rows', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-example-'));
  try {
    await promisify(execFile)(process.execPath, ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), path.resolve('examples/llm-agent-evals/run-local-agent-evals.ts')], { cwd: dir });
    for (const id of ['demo-agent-v1', 'demo-agent-v2']) {
      const result = validateEvalReport(JSON.parse(await readFile(path.join(dir, 'examples/llm-agent-evals/.evals_output', `${id}.json`), 'utf8')));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.errors.join('; '));
      expect(result.report.suites).toHaveLength(3);
      for (const suite of result.report.suites) {
        const rows = result.report.rows.filter((row) => row.suite === suite.id);
        expect(suite.total).toBe(rows.length);
        expect(suite.passed).toBe(rows.filter((row) => row.passed).length);
        expect(suite.failed).toBe(rows.filter((row) => !row.passed).length);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
