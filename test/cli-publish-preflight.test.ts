import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-publish-preflight-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('publish preflight (4F.2)', () => {
  it('hard-fails publish when unredacted sensitive evidence fields are present', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const reportDir = path.join(dir, 'eval-report');
    const outDir = path.join(dir, 'published-eval-report');
    await mkdir(artifactDir, { recursive: true });

    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z' },
      suites: [{ id: 'suite-a', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'suite-a',
          passed: true,
          input: 'raw prompt text',
          output: 'raw model output',
        },
      ],
    };
    await writeFile(path.join(artifactDir, 'run-1.json'), JSON.stringify(report, null, 2));

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'publish',
          `--input=${artifactDir}`,
          `--report-dir=${reportDir}`,
          `--out-dir=${outDir}`,
          '--target=dir',
          '--dry-run',
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected publish preflight failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('Publish preflight failed');
      expect(failure.stderr).toContain('input');
    }
  });

  it('succeeds when --redact strips sensitive fields before publishing', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const reportDir = path.join(dir, 'eval-report');
    const outDir = path.join(dir, 'published-eval-report');
    await mkdir(artifactDir, { recursive: true });

    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z' },
      suites: [{ id: 'suite-a', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'suite-a',
          passed: true,
          input: 'raw prompt text',
          output: 'raw model output',
        },
      ],
    };
    await writeFile(path.join(artifactDir, 'run-1.json'), JSON.stringify(report, null, 2));

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'publish',
        `--input=${artifactDir}`,
        `--report-dir=${reportDir}`,
        `--out-dir=${outDir}`,
        '--target=dir',
        '--dry-run',
        '--redact',
      ],
      { cwd: process.cwd() },
    );

    const runRecord = JSON.parse(
      await readFile(path.join(reportDir, 'publish-run-record.json'), 'utf8'),
    ) as {
      schemaVersion: string;
      redactionProfile: string;
      sensitiveFieldsFoundBeforeRedaction: string[];
      allowSensitivePublish: boolean;
    };
    expect(runRecord.schemaVersion).toBe('eval-publish-run-record/v1');
    expect(runRecord.redactionProfile).toBe('default');
    expect(runRecord.sensitiveFieldsFoundBeforeRedaction).toEqual([]);
    expect(runRecord.allowSensitivePublish).toBe(false);
  });

  it('publishes with unredacted evidence when --allow-sensitive-publish is set, recording the override', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const reportDir = path.join(dir, 'eval-report');
    const outDir = path.join(dir, 'published-eval-report');
    await mkdir(artifactDir, { recursive: true });

    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z' },
      suites: [{ id: 'suite-a', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'suite-a',
          passed: true,
          input: 'raw prompt text',
          output: 'raw model output',
        },
      ],
    };
    await writeFile(path.join(artifactDir, 'run-1.json'), JSON.stringify(report, null, 2));

    const { stderr } = await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'publish',
        `--input=${artifactDir}`,
        `--report-dir=${reportDir}`,
        `--out-dir=${outDir}`,
        '--target=dir',
        '--dry-run',
        '--allow-sensitive-publish',
      ],
      { cwd: process.cwd() },
    );

    expect(stderr).toContain('Warning: publishing with unredacted sensitive evidence field(s) present');

    const runRecord = JSON.parse(
      await readFile(path.join(reportDir, 'publish-run-record.json'), 'utf8'),
    ) as {
      redactionProfile: string;
      sensitiveFieldsFoundBeforeRedaction: string[];
      allowSensitivePublish: boolean;
    };
    expect(runRecord.redactionProfile).toBe('none');
    expect(runRecord.sensitiveFieldsFoundBeforeRedaction).toContain('input');
    expect(runRecord.allowSensitivePublish).toBe(true);
  });
});
