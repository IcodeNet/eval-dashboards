import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('check --step-summary-out', () => {
  it('should append a markdown summary to the file when the gate passes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'eval-step-summary-'));
    tempDirs.push(dir);
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-a', generatedAt: '2026-09-15T00:00:00.000Z' },
      suites: [{ id: 's', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r1', suite: 's', passed: true }],
    };
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(report), 'utf8');
    const summaryPath = path.join(dir, 'summary.md');
    await writeFile(summaryPath, 'existing\n', 'utf8');

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0', `--step-summary-out=${summaryPath}`],
      { cwd: process.cwd() },
    );

    const written = await readFile(summaryPath, 'utf8');
    expect(written.startsWith('existing\n## Eval gate: passed')).toBe(true);
  });
});
