import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { findJsonReports } from '../src/io/reports.js';
import { readEvalReports } from '../src/io/reports.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-io-'));
  tempDirs.push(dir);
  return dir;
};

describe('io reports', () => {
  it('returns actionable guidance when artifact directory is missing', async () => {
    await expect(findJsonReports('.path-that-does-not-exist-eval-dashboards')).rejects.toMatchObject({
      message: expect.stringContaining('No eval artifacts directory found'),
      exitCode: 3,
    });

    await expect(findJsonReports('.path-that-does-not-exist-eval-dashboards')).rejects.toMatchObject({
      message: expect.stringContaining('eval-dashboards lint --input=.evals_output'),
      exitCode: 3,
    });

    await expect(findJsonReports('.path-that-does-not-exist-eval-dashboards')).rejects.toMatchObject({
      message: expect.stringContaining('eval-dashboards check --input=.evals_output'),
      exitCode: 3,
    });
  });

  it('returns actionable guidance when input directory exists but has no JSON artifacts', async () => {
    const dir = await createTempDir();

    await expect(readEvalReports(dir)).rejects.toMatchObject({
      message: expect.stringContaining('No eval report JSON files found under'),
      exitCode: 3,
    });
  });

  it('excludes the report output directory from a rescan of --input (own output is not mistaken for an artifact)', async () => {
    const dir = await createTempDir();
    const { writeFile, mkdir } = await import('node:fs/promises');

    const validReport = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run1', generatedAt: '2026-09-16T00:00:00Z' },
      total: 1,
      passed: 1,
      failed: 0,
      suites: [{ id: 's1', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r1', suite: 's1', passed: true }],
    };
    await writeFile(path.join(dir, 'report.json'), JSON.stringify(validReport), 'utf8');

    const reportDir = path.join(dir, 'eval-report');
    await mkdir(reportDir, { recursive: true });
    // Simulate a previously-generated summary.json that is NOT a valid
    // eval-report/v1 artifact (e.g. a check-payload/history shape).
    await writeFile(path.join(reportDir, 'summary.json'), JSON.stringify({ notAnArtifact: true }), 'utf8');

    // Without excludeDirs this would throw on the malformed summary.json;
    // with excludeDirs it correctly finds only the real artifact.
    const reports = await readEvalReports(dir, { excludeDirs: [reportDir] });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.run.id).toBe('run1');

    const files = await findJsonReports(dir, { excludeDirs: [reportDir] });
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('report.json');
  });
});
