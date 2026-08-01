import { describe, expect, it } from 'vitest';
import { compareRuns } from '../src/history/history.js';
import { checkGates } from '../src/gates/check-gates.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const previous: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'previous', generatedAt: '2026-07-30T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: true },
  ],
};

const current: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'current', generatedAt: '2026-07-31T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
};

describe('checkGates', () => {
  it('fails when pass rate, new failure, and critical gates are breached', () => {
    const result = checkGates(current, compareRuns(current, previous), {
      minPassRate: 0.9,
      maxNewFailures: 0,
      zeroCritical: true,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(3);
  });

  it('passes when all CLI gates are satisfied', () => {
    const result = checkGates(current, compareRuns(current, previous), {
      minPassRate: 0.4,
      maxNewFailures: 5,
      zeroCritical: false,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('enforces blocking suite manifest passRate threshold when breached', () => {
    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(reportWithManifest, compareRuns(reportWithManifest, previous), {});

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/quality.*pass rate.*blocking threshold/);
  });

  it('ignores report-only suite manifest thresholds', () => {
    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(reportWithManifest, compareRuns(reportWithManifest, previous), {});

    expect(result.passed).toBe(true);
  });

  it('passes when suite manifest threshold is met', () => {
    const passing: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'passing', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
      rows: [
        { id: 'tone', suite: 'quality', passed: true },
        { id: 'safety', suite: 'quality', passed: true },
      ],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(passing, compareRuns(passing, undefined), {});

    expect(result.passed).toBe(true);
  });
});