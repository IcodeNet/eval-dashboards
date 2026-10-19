/**
 * Hand-built baseline and current runs for the report accuracy test. Every
 * expected number in `report-accuracy.test.ts` was worked out by hand from the
 * table below, not copied from the tool's output.
 *
 * Rows (suite:id), baseline -> current:
 *   safety:q1        pass -> pass
 *   safety:q2        pass -> FAIL   (newly failing, critical)
 *   safety:q3        FAIL -> FAIL   (persistent failure)
 *   safety:q4        FAIL -> pass   (newly passing)
 *   safety:gone      pass -> absent (disappeared)
 *   quality:q1       pass -> pass   (same id as safety:q1, a different row)
 *   quality:q2       pass -> FAIL   (same id as safety:q2, high severity)
 *   quality:fresh    absent -> FAIL (a new row that fails counts as newly failing)
 *   safety:dup       FAIL -> FAIL   (persistent; shares an id with quality:dup)
 *   quality:dup      pass -> FAIL   (newly failing; only correct when the suite is part of the row key)
 *
 * Baseline: 9 rows, 6 pass. Current: 9 rows, 3 pass.
 */
import type { EvalReportV1 } from '../../../src/model/eval-report-v1.js';

export const goldenBaseline: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'golden-baseline', generatedAt: '2026-10-01T00:00:00.000Z' },
  suites: [
    { id: 'safety', total: 6, passed: 3, failed: 3 },
    { id: 'quality', total: 3, passed: 3, failed: 0 },
  ],
  rows: [
    { id: 'q1', suite: 'safety', passed: true },
    { id: 'q2', suite: 'safety', passed: true },
    { id: 'q3', suite: 'safety', passed: false },
    { id: 'q4', suite: 'safety', passed: false },
    { id: 'gone', suite: 'safety', passed: true },
    { id: 'q1', suite: 'quality', passed: true },
    { id: 'q2', suite: 'quality', passed: true },
    { id: 'dup', suite: 'safety', passed: false },
    { id: 'dup', suite: 'quality', passed: true },
  ],
};

export const goldenCurrent: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'golden-current', generatedAt: '2026-10-02T00:00:00.000Z' },
  suites: [
    { id: 'safety', total: 5, passed: 2, failed: 3 },
    { id: 'quality', total: 4, passed: 1, failed: 3 },
  ],
  rows: [
    { id: 'q1', suite: 'safety', passed: true },
    { id: 'q2', suite: 'safety', passed: false, severity: 'critical', category: 'pii' },
    { id: 'q3', suite: 'safety', passed: false },
    { id: 'q4', suite: 'safety', passed: true },
    { id: 'q1', suite: 'quality', passed: true },
    { id: 'q2', suite: 'quality', passed: false, severity: 'high' },
    { id: 'fresh', suite: 'quality', passed: false },
    { id: 'dup', suite: 'safety', passed: false },
    { id: 'dup', suite: 'quality', passed: false },
  ],
};
