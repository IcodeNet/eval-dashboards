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
});
