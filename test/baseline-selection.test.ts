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

  it('excludes calibration-kind runs from automatic baseline selection', () => {
    const calibration = makeReport('run-calibration', '2026-08-01T00:00:00Z', [true]);
    calibration.run.kind = 'calibration';
    const candidate = makeReport('run-candidate', '2026-08-02T00:00:00Z', [true]);
    const current = makeReport('run-current', '2026-08-03T00:00:00Z', [true]);

    const result = selectBaselineByStrategy([calibration, candidate, current], 'run-current', {
      strategy: 'rolling',
    });

    expect(result).toBe(candidate);
  });

  describe('when runs cover different suites', () => {
    const makeSuiteReport = (runId: string, generatedAt: string, suite: string, passed = true): EvalReportV1 => ({
      schemaVersion: 'eval-report/v1',
      run: { id: runId, generatedAt },
      suites: [{ id: suite, total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1 }],
      rows: [{ id: 'r1', suite, passed }],
    });

    it('should skip a run that shares no suite with the current run when picking a rolling baseline', () => {
      const safetyOld = makeSuiteReport('safety-1', '2026-10-01T00:00:00Z', 'safety');
      const quality = makeSuiteReport('quality-1', '2026-10-02T00:00:00Z', 'quality');
      const safetyNew = makeSuiteReport('safety-2', '2026-10-03T00:00:00Z', 'safety');

      const result = selectBaselineByStrategy([safetyOld, quality, safetyNew], 'safety-2', { strategy: 'rolling' });

      expect(result).toBe(safetyOld);
    });

    it('should return no baseline when no earlier run shares a suite with the current run', () => {
      const quality = makeSuiteReport('quality-1', '2026-10-02T00:00:00Z', 'quality');
      const safety = makeSuiteReport('safety-1', '2026-10-03T00:00:00Z', 'safety');

      expect(selectBaselineByStrategy([quality, safety], 'safety-1', { strategy: 'rolling' })).toBeUndefined();
    });

    it('should keep a run that shares at least one suite when the current run adds a new suite', () => {
      const before = makeSuiteReport('before', '2026-10-01T00:00:00Z', 'safety');
      const current = makeSuiteReport('current', '2026-10-02T00:00:00Z', 'safety');
      current.suites.push({ id: 'quality', total: 1, passed: 1, failed: 0 });
      current.rows.push({ id: 'r1', suite: 'quality', passed: true });

      expect(selectBaselineByStrategy([before, current], 'current', { strategy: 'rolling' })).toBe(before);
    });

    it('should take a suite from the rows when the run lists no suites', () => {
      const before = makeReport('before', '2026-10-01T00:00:00Z', [true]);
      const other = makeSuiteReport('other', '2026-10-02T00:00:00Z', 'quality');
      const current = makeReport('current', '2026-10-03T00:00:00Z', [true]);

      expect(selectBaselineByStrategy([before, other, current], 'current', { strategy: 'rolling' })).toBe(before);
    });

    it('should ignore suites when the current run has none at all', () => {
      const before = makeSuiteReport('before', '2026-10-01T00:00:00Z', 'safety');
      const current: EvalReportV1 = {
        schemaVersion: 'eval-report/v1',
        run: { id: 'current', generatedAt: '2026-10-02T00:00:00Z' },
        suites: [],
        rows: [],
      };

      expect(selectBaselineByStrategy([before, current], 'current', { strategy: 'rolling' })).toBe(before);
    });

    it('should only consider runs that share a suite when the champion strategy picks the best pass rate', () => {
      const safetyGood = makeSuiteReport('safety-good', '2026-10-01T00:00:00Z', 'safety', true);
      const qualityPerfect = makeSuiteReport('quality-perfect', '2026-10-02T00:00:00Z', 'quality', true);
      const safetyNow = makeSuiteReport('safety-now', '2026-10-03T00:00:00Z', 'safety', false);
      const safetyBad = makeSuiteReport('safety-bad', '2026-10-02T12:00:00Z', 'safety', false);

      const result = selectBaselineByStrategy([safetyGood, qualityPerfect, safetyBad, safetyNow], 'safety-now', {
        strategy: 'champion',
      });

      expect(result).toBe(safetyGood);
    });

    it('should apply the lookback window after dropping runs with no shared suite when a lookback is set', () => {
      const safetyOld = makeSuiteReport('safety-1', '2026-10-01T00:00:00Z', 'safety');
      const q1 = makeSuiteReport('quality-1', '2026-10-02T00:00:00Z', 'quality');
      const q2 = makeSuiteReport('quality-2', '2026-10-03T00:00:00Z', 'quality');
      const safetyNew = makeSuiteReport('safety-2', '2026-10-04T00:00:00Z', 'safety');

      const result = selectBaselineByStrategy([safetyOld, q1, q2, safetyNew], 'safety-2', {
        strategy: 'rolling',
        lookback: 1,
      });

      expect(result).toBe(safetyOld);
    });
  });
});
