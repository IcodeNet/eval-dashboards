import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-check-waivers-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const buildReport = (failSafety: boolean) => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'waiver-e2e-001', generatedAt: '2026-09-15T00:00:00.000Z' },
  suites: [{ id: 'safety', total: 2, passed: failSafety ? 1 : 2, failed: failSafety ? 1 : 0 }],
  rows: [
    { id: 'tone', suite: 'safety', passed: true },
    { id: 'injection-01', suite: 'safety', passed: !failSafety, severity: 'critical' },
  ],
});

describe('check --waiver-file (4F.5)', () => {
  it('lets a known failure ship via an active waiver, reported prominently', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport(true)), 'utf8');

    const waiverPath = path.join(dir, 'waivers.json');
    await writeFile(
      waiverPath,
      JSON.stringify({
        schemaVersion: 'eval-waiver-register/v1',
        waivers: [
          {
            id: 'w-injection-01',
            suite: 'safety',
            rowId: 'injection-01',
            reason: 'Known judge false negative, fix tracked',
            riskOwner: 'alice@example.com',
            ticket: 'JIRA-1',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        ],
      }),
      'utf8',
    );

    const outPath = path.join(dir, 'check-result.json');
    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        `--input=${inputDir}`,
        '--min-pass-rate=1',
        `--waiver-file=${waiverPath}`,
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      diagnostics: string[];
      waivers?: { active: unknown[]; expired: unknown[] };
    };

    expect(parsed.passed).toBe(true);
    expect(parsed.waivers?.active).toHaveLength(1);
    expect(parsed.diagnostics.some((line) => line.includes('ACTIVE WAIVER'))).toBe(true);
  });

  it('fails the gate when a waiver has expired, even though it matches the failing row', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport(true)), 'utf8');

    const waiverPath = path.join(dir, 'waivers.json');
    await writeFile(
      waiverPath,
      JSON.stringify({
        schemaVersion: 'eval-waiver-register/v1',
        waivers: [
          {
            id: 'w-injection-01',
            suite: 'safety',
            rowId: 'injection-01',
            reason: 'Known judge false negative',
            riskOwner: 'alice@example.com',
            ticket: 'JIRA-1',
            expiresAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      }),
      'utf8',
    );

    const outPath = path.join(dir, 'check-result.json');
    await expect(
      execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          `--input=${inputDir}`,
          '--zero-critical',
          `--waiver-file=${waiverPath}`,
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toThrow();

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      failures: string[];
      waivers?: { expired: unknown[] };
    };

    expect(parsed.passed).toBe(false);
    expect(parsed.waivers?.expired).toHaveLength(1);
    expect(parsed.failures.some((line) => line.includes('expired'))).toBe(true);
  });

  it('fails fast with exit code 2 for a malformed waiver register', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport(false)), 'utf8');

    const waiverPath = path.join(dir, 'waivers.json');
    await writeFile(waiverPath, 'not json', 'utf8');

    await expect(
      execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${inputDir}`, `--waiver-file=${waiverPath}`],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({ code: 2 });
  });
});
