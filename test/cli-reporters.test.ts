import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('skips calibration-kind artifacts when choosing default current run', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const currentReport = JSON.parse(templateRaw) as any;
    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-08-03T00:00:00.000Z';

    const calibrationRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-calibration.json'),
      'utf8',
    );
    const calibrationReport = JSON.parse(calibrationRaw) as any;
    calibrationReport.run.id = 'run-calibration';
    calibrationReport.run.generatedAt = '2026-08-04T00:00:00.000Z';
    calibrationReport.run.kind = 'calibration';

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-calibration.json'), JSON.stringify(calibrationReport, null, 2)),
    ]);

    const { stdout } = await execFileAsync(
      'pnpm',
      ['cli:dev', 'report', `--input=${artifactDir}`, '--reporter=text'],
      { cwd: process.cwd() },
    );

    expect(stdout).toContain('Run:              run-current');
  });
});
