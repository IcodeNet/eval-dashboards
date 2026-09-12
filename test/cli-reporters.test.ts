import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-reports-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('cli reporter normalization', () => {
  it('accepts markdown as alias for markdown-summary', async () => {
    const reportDir = await createTempDir();

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'report', '--input=examples/basic-json', `--report-dir=${reportDir}`, '--reporter=markdown'],
      { cwd: process.cwd() },
    );

    const summaryPath = path.join(reportDir, 'summary.md');
    const summary = await readFile(summaryPath, 'utf8');
    expect(summary).toContain('# Eval Report');
  });

  it('exits 2 for unknown reporter token', async () => {
    const reportDir = await createTempDir();

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'report', '--input=examples/basic-json', `--report-dir=${reportDir}`, '--reporter=bogus'],
        { cwd: process.cwd() },
      );
      throw new Error('expected reporter validation to fail');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr ?? '').toContain('Unknown reporter bogus');
    }
  });
});
