import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-pr-tier-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const buildReport = (runId: string) => ({
  schemaVersion: 'eval-report/v1',
  run: { id: runId, generatedAt: '2026-09-15T00:00:00.000Z' },
  suites: [
    { id: 'fast', total: 1, passed: 1, failed: 0 },
    { id: 'slow', total: 1, passed: 1, failed: 0 },
  ],
  rows: [
    { id: 'r1', suite: 'fast', passed: true, durationMs: 100, metadata: { costUsd: 0.01 } },
    { id: 'r2', suite: 'slow', passed: true, durationMs: 9000, metadata: { costUsd: 2 } },
  ],
  suiteManifests: [
    {
      name: 'fast',
      target: 'agent',
      datasetSource: 'synthetic',
      datasetVersion: '1',
      rubricVersion: '1',
      riskArea: 'response-quality',
      graders: ['deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: {} },
      tier: 'pr',
    },
    {
      name: 'slow',
      target: 'agent',
      datasetSource: 'synthetic',
      datasetVersion: '1',
      rubricVersion: '1',
      riskArea: 'response-quality',
      graders: ['deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: {} },
      tier: 'full',
    },
  ],
});

describe('4F.10 PR-subset vs full-suite tiering', () => {
  it('gates only the pr-tier suite and reports its cost/runtime summary', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('r1')), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0', '--tier=pr', `--json-out=${outPath}`],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      prTier: { tier: string; suiteCount: number; rowCount: number; totalCostUsd: number; totalDurationMs: number };
    };
    expect(payload.prTier.tier).toBe('pr');
    expect(payload.prTier.suiteCount).toBe(1);
    expect(payload.prTier.rowCount).toBe(1);
    expect(payload.prTier.totalCostUsd).toBeCloseTo(0.01, 5);
    expect(payload.prTier.totalDurationMs).toBe(100);
  });

  it('fails the gate when the pr tier exceeds an explicit cost budget', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('r2')), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await expect(
      execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          `--input=${inputDir}`,
          '--min-pass-rate=0',
          '--tier=pr',
          '--max-pr-cost-usd=0.001',
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toThrow();

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      failures: string[];
    };
    expect(payload.passed).toBe(false);
    expect(payload.failures.some((f) => /budget/.test(f))).toBe(true);
  });

  it('rejects an invalid --tier value', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('r3')), 'utf8');

    await expect(
      execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0', '--tier=nightly'],
        { cwd: process.cwd() },
      ),
    ).rejects.toThrow();
  });
});
