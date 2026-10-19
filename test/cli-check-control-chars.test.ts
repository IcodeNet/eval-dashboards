import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('check output with terminal control codes in the artifact', () => {
  it('should print no escape characters when a row category contains one', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'eval-control-chars-'));
    tempDirs.push(dir);
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-a', generatedAt: '2026-09-15T00:00:00.000Z' },
      suites: [{ id: 's', total: 1, passed: 0, failed: 1 }],
      rows: [{ id: 'r1', suite: 's', passed: false, category: 'cat\u001b[31mred' }],
    };
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(report), 'utf8');

    const result = await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0'],
      { cwd: process.cwd() },
    );

    expect(result.stdout).toContain('Top failing categories: catred=1');
    expect(result.stdout).not.toContain('\u001b');
  });
});
