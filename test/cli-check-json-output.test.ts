import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-check-json-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('check --json-out', () => {
  it('writes machine-readable check output on pass', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'check-result.json');

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        '--input=examples/agent-quality-preset/artifacts',
        '--min-pass-rate=0.1',
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      schemaVersion: string;
      passed: boolean;
      runId: string;
      failures: string[];
      newlyFailingRows: Array<{ id: string; suite: string; reportAnchor: string }>;
    };

    expect(parsed.schemaVersion).toBe('eval-check-result/v1');
    expect(parsed.passed).toBe(true);
    expect(parsed.runId).toBe('agent-quality-template-001');
    expect(Array.isArray(parsed.failures)).toBe(true);
    expect(Array.isArray(parsed.newlyFailingRows)).toBe(true);
  });

  it('writes machine-readable check output on failure', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'check-result.json');

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--min-pass-rate=0.9',
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(1);
    }

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      failures: string[];
      newlyFailingRows: Array<{ reportAnchor: string }>;
    };

    expect(parsed.passed).toBe(false);
    expect(parsed.failures.length).toBeGreaterThan(0);
    expect(parsed.newlyFailingRows.every((row) => row.reportAnchor.startsWith('#row-'))).toBe(true);
  });
});
