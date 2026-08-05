import { describe, expect, it } from 'vitest';
import { selectBaseline, selectBaselineByStrategy, selectRun } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const makeReport = (
  runId: string,
  generatedAt: string,
  rowPattern: boolean[] = [],
  mode?: string,
): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: {
    id: runId,
    generatedAt,
  },
  suites: [],
  rows: rowPattern.map((passed, index) => ({
    id: `row-${index + 1}`,
    suite: 'suite-a',
    passed,
    severity: 'none',
  })),
  suiteManifests: [],
  rubricContracts: [],
  baselineCompatibility: undefined,
  metadata: mode ? { mode } : {},
});

describe('selectBaseline', () => {
  it('returns the report matching the baseline run ID', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');
    const run3 = makeReport('run-003', '2026-08-03T00:00:00Z');

    const result = selectBaseline([run1, run2, run3], 'run-002');

    expect(result).toBe(run2);
  });

  it('returns undefined if no matching baseline run ID found', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');

    const result = selectBaseline([run1, run2], 'run-999');

    expect(result).toBeUndefined();
  });

  it('returns undefined from an empty reports array', () => {
    const result = selectBaseline([], 'run-001');

    expect(result).toBeUndefined();
  });
});

describe('selectRun', () => {
  it('returns the report matching the explicit run ID', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');
    const run3 = makeReport('run-003', '2026-08-03T00:00:00Z');

    const result = selectRun([run1, run2, run3], 'run-003');

    expect(result).toBe(run3);
  });

  it('returns undefined when explicit run ID is missing', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');

    const result = selectRun([run1, run2], 'run-999');

    expect(result).toBeUndefined();
  });
});

describe('selectBaselineByStrategy', () => {
  it('uses rolling strategy to select the immediately previous run', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z', [true]);
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z', [true]);
    const run3 = makeReport('run-003', '2026-08-03T00:00:00Z', [true]);

    const result = selectBaselineByStrategy([run1, run2, run3], 'run-003', {
      strategy: 'rolling',
    });

    expect(result).toBe(run2);
  });

  it('uses champion strategy to select highest pass-rate prior run', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z', [true, false]);
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z', [true, true]);
    const run3 = makeReport('run-003', '2026-08-03T00:00:00Z', [true, false]);

    const result = selectBaselineByStrategy([run1, run2, run3], 'run-003', {
      strategy: 'champion',
    });

    expect(result).toBe(run2);
  });

  it('applies lookback window before champion selection', () => {
    const run1 = makeReport('run-001', '2026-08-01T00:00:00Z', [true, true]);
    const run2 = makeReport('run-002', '2026-08-02T00:00:00Z', [false, false]);
    const run3 = makeReport('run-003', '2026-08-03T00:00:00Z', [true, false]);

    const result = selectBaselineByStrategy([run1, run2, run3], 'run-003', {
      strategy: 'champion',
      lookback: 1,
    });

    expect(result).toBe(run2);
  });

  it('prefers baselines with matching run mode metadata', () => {
    const offline = makeReport('run-offline', '2026-08-01T00:00:00Z', [true, true], 'offline');
    const live = makeReport('run-live', '2026-08-02T00:00:00Z', [true, true], 'live');
    const current = makeReport('run-current', '2026-08-03T00:00:00Z', [true], 'live');

    const result = selectBaselineByStrategy([offline, live, current], 'run-current', {
      strategy: 'rolling',
    });

    expect(result).toBe(live);
  });
});
