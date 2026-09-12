import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalReportV1, SuiteManifest } from '../src/model/eval-report-v1.js';
import { validateEvalReport } from '../src/model/validate.js';

type BenchmarkPack = {
  packVersion: string;
  suites: SuiteManifest[];
};

const loadPack = (fileName: string): BenchmarkPack => {
  const filePath = path.resolve(process.cwd(), 'examples/benchmark-packs', fileName);
  return JSON.parse(readFileSync(filePath, 'utf8')) as BenchmarkPack;
};

const toMinimalReport = (pack: BenchmarkPack): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'pack-compatibility-check', generatedAt: '2026-09-12T00:00:00.000Z' },
  suites: pack.suites.map((suite) => ({ id: suite.name, total: 1, passed: 1, failed: 0 })),
  rows: pack.suites.map((suite, index) => ({ id: `row-${index}`, suite: suite.name, passed: true })),
  suiteManifests: pack.suites,
});

describe('benchmark pack templates', () => {
  it.each([
    'safety-pack.v1.json',
    'tool-routing-pack.v1.json',
    'groundedness-pack.v1.json',
  ])('keeps %s aligned with eval-report/v1 suite manifest validation', (fileName) => {
    const pack = loadPack(fileName);
    expect(pack.packVersion).toBe('benchmark-pack/v1');
    expect(pack.suites.length).toBeGreaterThan(0);

    const result = validateEvalReport(toMinimalReport(pack));
    expect(result.ok).toBe(true);
  });
});
