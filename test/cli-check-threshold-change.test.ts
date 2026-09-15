import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-check-threshold-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const buildReport = () => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'threshold-e2e-001', generatedAt: '2026-09-15T00:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
});

describe('check --baseline-gate-config (4F.6)', () => {
  it('fails the gate when the resolved config loosens minPassRate vs baseline, unapproved', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport()), 'utf8');

    const baselinePath = path.join(dir, 'baseline-gate-config.json');
    await writeFile(baselinePath, JSON.stringify({ minPassRate: 0.9 }), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await expect(
      execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          `--input=${inputDir}`,
          '--min-pass-rate=0.1',
          `--baseline-gate-config=${baselinePath}`,
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toThrow();

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      failures: string[];
      thresholdChanges?: { loosened: boolean; allowed: boolean; changes: unknown[] };
    };
    expect(payload.passed).toBe(false);
    expect(payload.failures.some((f) => f.includes('minPassRate loosened from 0.9 to 0.1'))).toBe(true);
    expect(payload.thresholdChanges?.loosened).toBe(true);
    expect(payload.thresholdChanges?.allowed).toBe(false);
  });

  it('passes when the loosening is explicitly allowed via --allow-gate-loosening', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport()), 'utf8');

    const baselinePath = path.join(dir, 'baseline-gate-config.json');
    await writeFile(baselinePath, JSON.stringify({ minPassRate: 0.9 }), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        `--input=${inputDir}`,
        '--min-pass-rate=0.1',
        `--baseline-gate-config=${baselinePath}`,
        '--allow-gate-loosening',
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      thresholdChanges?: { loosened: boolean; allowed: boolean };
    };
    expect(payload.passed).toBe(true);
    expect(payload.thresholdChanges?.loosened).toBe(true);
    expect(payload.thresholdChanges?.allowed).toBe(true);
  });

  it('does not fail when resolved config only tightens vs baseline', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport()), 'utf8');

    const baselinePath = path.join(dir, 'baseline-gate-config.json');
    await writeFile(baselinePath, JSON.stringify({ minPassRate: 0.1 }), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        `--input=${inputDir}`,
        '--min-pass-rate=0.1',
        `--baseline-gate-config=${baselinePath}`,
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      thresholdChanges?: { loosened: boolean };
    };
    expect(payload.passed).toBe(true);
    expect(payload.thresholdChanges?.loosened).toBe(false);
  });
});
