import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { findJsonReports } from '../src/io/reports.js';
import { readEvalReport, readEvalReports, writeJsonFile } from '../src/io/reports.js';

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
  it('rejects even identical copies of an artifact rather than duplicating history identity', async () => {
    const dir = await createTempDir();
    const { writeFile } = await import('node:fs/promises');
    const report = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'reused', generatedAt: '2026-10-11T12:00:00Z' },
      suites: [{ id: 's1', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r1', suite: 's1', passed: true }],
    };
    await Promise.all(['a.json', 'b.json'].map((name) => writeFile(path.join(dir, name), JSON.stringify(report))));
    await expect(readEvalReports(dir)).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringMatching(/Duplicate run ID "reused".*a\.json.*b\.json/),
    });
  });

});

describe('readEvalReport on a broken file', () => {
  it('should name the file and the fix when the artifact is not valid JSON', async () => {
    const dir = await createTempDir();
    const file = path.join(dir, 'run.json');
    await writeFile(file, '<html>login</html>', 'utf8');

    await expect(readEvalReport(file)).rejects.toMatchObject({
      message: expect.stringContaining(`Eval report ${file} is not valid JSON`),
      exitCode: 2,
    });
  });
});

describe('writeJsonFile', () => {
  it('should leave no temp file behind when the write succeeds', async () => {
    const dir = await createTempDir();

    await writeJsonFile(path.join(dir, 'out', 'a.json'), { ok: true });

    expect(await readdir(path.join(dir, 'out'))).toEqual(['a.json']);
    expect(await readFile(path.join(dir, 'out', 'a.json'), 'utf8')).toBe('{\n  "ok": true\n}\n');
  });

  it('should keep the old file and leave no temp file when the target is a directory', async () => {
    const dir = await createTempDir();
    await mkdir(path.join(dir, 'target.json'));

    await expect(writeJsonFile(path.join(dir, 'target.json'), { ok: true })).rejects.toThrow();

    expect(await readdir(dir)).toEqual(['target.json']);
  });
});
