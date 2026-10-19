import { describe, expect, it } from 'vitest';
import { checkGates, validateGateConfig } from '../src/gates/check-gates.js';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const report = (runId: string, rows: Array<[string, string, boolean]>): EvalReportV1 => {
  const suites = [...new Set(rows.map(([suite]) => suite))].map((id) => {
    const own = rows.filter(([suite]) => suite === id);
    const passed = own.filter(([, , ok]) => ok).length;
    return { id, total: own.length, passed, failed: own.length - passed };
  });
  return {
    schemaVersion: 'eval-report/v1',
    run: { id: runId, generatedAt: '2026-10-01T00:00:00.000Z' },
    suites,
    rows: rows.map(([suite, id, passed]) => ({ id, suite, passed })),
  };
};

const gate = (current: EvalReportV1, config: Parameters<typeof checkGates>[2], previous?: EvalReportV1) =>
  checkGates(current, compareRuns(current, previous), config, undefined, previous);

describe('per-suite minPassRate', () => {
  const current = report('now', [
    ['safety', 's1', true],
    ['safety', 's2', true],
    ['safety', 's3', false],
    ['quality', 'q1', true],
    ['quality', 'q2', true],
    ['quality', 'q3', true],
    ['quality', 'q4', false],
  ]);

  it('should fail only the suite below its own threshold when two suites have different thresholds', () => {
    const result = gate(current, { suites: { safety: { minPassRate: 1 }, quality: { minPassRate: 0.7 } } });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['Suite "safety" pass rate 0.667 is below required 1.000.']);
  });

  it('should pass when every suite meets its own threshold', () => {
    const result = gate(current, { suites: { safety: { minPassRate: 0.6 }, quality: { minPassRate: 0.75 } } });

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('should still apply the global minPassRate when a suite also has its own threshold', () => {
    const result = gate(current, { minPassRate: 0.9, suites: { safety: { minPassRate: 0.5 } } });

    expect(result.failures).toEqual(['Pass rate 0.714 is below required 0.900.']);
  });

  it('should fail closed when a configured suite is missing from the run', () => {
    const result = gate(current, { suites: { retrieval: { minPassRate: 0.5 } } });

    expect(result.failures).toEqual(['Suite "retrieval" has a threshold in gates.suites but is missing from this run.']);
  });
});

describe('per-suite maxNewFailures', () => {
  const previous = report('before', [
    ['safety', 's1', true],
    ['safety', 's2', true],
    ['quality', 'q1', true],
    ['quality', 'q2', true],
  ]);
  const current = report('now', [
    ['safety', 's1', false],
    ['safety', 's2', true],
    ['quality', 'q1', false],
    ['quality', 'q2', false],
  ]);

  it('should count new failures per suite when each suite has its own budget', () => {
    const result = gate(current, { suites: { safety: { maxNewFailures: 0 }, quality: { maxNewFailures: 2 } } }, previous);

    expect(result.failures).toEqual(['Suite "safety" has 1 new failure(s), above the allowed 0.']);
  });

  it('should pass when each suite stays within its own budget', () => {
    const result = gate(current, { suites: { safety: { maxNewFailures: 1 }, quality: { maxNewFailures: 2 } } }, previous);

    expect(result.failures).toEqual([]);
  });

  it('should not let another suite use up the budget when the global limit is looser', () => {
    const result = gate(current, { maxNewFailures: 10, suites: { quality: { maxNewFailures: 1 } } }, previous);

    expect(result.failures).toEqual(['Suite "quality" has 2 new failure(s), above the allowed 1.']);
  });
});

describe('validateGateConfig for gates.suites', () => {
  it('should reject a per-suite pass rate above 1 when the config is validated', () => {
    expect(validateGateConfig({ suites: { safety: { minPassRate: 1.5 } } })).toEqual([
      'suites.safety.minPassRate must be a finite number between 0 and 1.',
    ]);
  });

  it('should reject a negative or fractional per-suite budget when the config is validated', () => {
    expect(validateGateConfig({ suites: { safety: { maxNewFailures: -1 }, quality: { maxNewFailures: 1.5 } } })).toEqual([
      'suites.safety.maxNewFailures must be a non-negative integer.',
      'suites.quality.maxNewFailures must be a non-negative integer.',
    ]);
  });

  it('should reject an unknown per-suite key when a setting is misspelled', () => {
    expect(validateGateConfig({ suites: { safety: { minPassRat: 1 } as never } })).toEqual([
      'suites.safety.minPassRat is not a per-suite setting. Allowed: minPassRate, maxNewFailures.',
    ]);
  });

  it('should accept a config with no per-suite thresholds', () => {
    expect(validateGateConfig({ minPassRate: 0.9 })).toEqual([]);
  });
});
