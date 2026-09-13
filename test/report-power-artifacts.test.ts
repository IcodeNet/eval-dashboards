import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const artifactsDir = path.join(root, 'examples', 'report-power-artifacts');

const readJson = <T>(relativePath: string): T => {
  const fullPath = path.join(artifactsDir, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf8')) as T;
};

describe('report-power artifacts are tracked and structured', () => {
  it('includes history and summary with required progress/detail fields', () => {
    const history = readJson<Array<Record<string, unknown>>>('report/history.json');
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const summary = readJson<{
      summary: { passRate: number };
      comparison: {
        previousRunId?: string;
        persistentFailures?: unknown[];
        disappeared?: unknown[];
      };
    }>('report/summary.json');

    expect(typeof summary.summary.passRate).toBe('number');
    expect(summary.comparison.previousRunId).toBeTruthy();
    expect(Array.isArray(summary.comparison.persistentFailures)).toBe(true);
    expect(Array.isArray(summary.comparison.disappeared)).toBe(true);
  });

  it('includes both passing and failing gate outputs', () => {
    const passGate = readJson<{ passed: boolean }>('gates/check-pass.json');
    const failGate = readJson<{ passed: boolean; failures?: unknown[] }>('gates/check-fail.json');

    expect(passGate.passed).toBe(true);
    expect(failGate.passed).toBe(false);
    expect(Array.isArray(failGate.failures)).toBe(true);
    expect((failGate.failures ?? []).length).toBeGreaterThan(0);
  });
});
