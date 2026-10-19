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

  it('should write no escape characters to the step summary or JUnit file when a row field contains one', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'eval-control-chars-'));
    tempDirs.push(dir);
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-a', generatedAt: '2026-09-15T00:00:00.000Z' },
      suites: [{ id: 's', total: 1, passed: 0, failed: 1 }],
      rows: [{ id: 'r\u001b[2Jx', suite: 's', passed: false, category: 'cat\u001b[31mred', severity: 'high' }],
    };
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(report), 'utf8');
    const summaryPath = path.join(dir, 'summary.md');
    const junitPath = path.join(dir, 'junit.xml');

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0', `--step-summary-out=${summaryPath}`, `--junit-out=${junitPath}`],
      { cwd: process.cwd() },
    );

    const summary = await readFile(summaryPath, 'utf8');
    const junit = await readFile(junitPath, 'utf8');
    expect(summary).toContain('| s | rx | catred | high |');
    expect(summary).not.toContain('\u001b');
    expect(junit).not.toContain('\u001b');
  });
});
