import { describe, expect, it } from 'vitest';
import { EVAL_REPORT_SCHEMA_VERSION, type EvalReportV1 } from '../src/model/eval-report-v1.js';
import { buildHistory } from '../src/history/history.js';
import { applyRetention, buildTrendSeries, queryHistory } from '../src/history/query.js';

const makeReport = (
  id: string,
  generatedAt: string,
  branch: string,
  suite: string,
  passed: boolean,
): EvalReportV1 => ({
  schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
  run: { id, generatedAt, branch },
  suites: [{ id: suite, total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1 }],
  rows: [{ id: 'row', suite, passed }],
});

const makeEntries = () =>
  buildHistory([
    makeReport('r1', '2026-01-01T00:00:00Z', 'main', 'safety', true),
    makeReport('r2', '2026-02-01T00:00:00Z', 'main', 'quality', false),
    makeReport('r3', '2026-03-01T00:00:00Z', 'feature', 'safety', true),
    makeReport('r4', '2026-04-01T00:00:00Z', 'main', 'safety', false),
  ]);

const ids = (entries: ReturnType<typeof makeEntries>) => entries.map((entry) => entry.run.id);

describe('queryHistory', () => {
  it('should keep only runs inside the range when since and until are set', () => {
    const result = queryHistory(makeEntries(), { since: '2026-02-01', until: '2026-03-15' });

    expect(ids(result)).toEqual(['r2', 'r3']);
  });

  it('should keep only runs on the branch when a branch is set', () => {
    expect(ids(queryHistory(makeEntries(), { branch: 'main' }))).toEqual(['r1', 'r2', 'r4']);
  });

  it('should keep only runs that include the suite when a suite is set', () => {
    expect(ids(queryHistory(makeEntries(), { suite: 'safety' }))).toEqual(['r1', 'r3', 'r4']);
  });

  it('should combine filters when several are set', () => {
    const result = queryHistory(makeEntries(), { branch: 'main', suite: 'safety', since: '2026-02-01' });

    expect(ids(result)).toEqual(['r4']);
  });

  it('should return every run oldest first when no filter is set', () => {
    const shuffled = [...makeEntries()].reverse();

    expect(ids(queryHistory(shuffled))).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('should throw a clear error when a date is not valid', () => {
    expect(() => queryHistory(makeEntries(), { since: 'last week' })).toThrow('--since must be an ISO date');
  });
});

describe('applyRetention', () => {
  it('should keep the newest runs when keepLast is set', () => {
    expect(ids(applyRetention(makeEntries(), { keepLast: 2 }))).toEqual(['r3', 'r4']);
  });

  it('should drop runs older than the age limit when maxAgeDays is set', () => {
    const now = new Date('2026-04-10T00:00:00Z');

    expect(ids(applyRetention(makeEntries(), { maxAgeDays: 20, now }))).toEqual(['r4']);
  });

  it('should apply both limits when both are set', () => {
    const now = new Date('2026-04-10T00:00:00Z');

    expect(ids(applyRetention(makeEntries(), { maxAgeDays: 90, keepLast: 1, now }))).toEqual(['r4']);
  });

  it('should keep every run when no limit is set', () => {
    expect(ids(applyRetention(makeEntries(), {}))).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('should reject a keepLast below one', () => {
    expect(() => applyRetention(makeEntries(), { keepLast: 0 })).toThrow('--keep-last');
  });

  it('should reject a maxAgeDays that is not positive', () => {
    expect(() => applyRetention(makeEntries(), { maxAgeDays: -5 })).toThrow('--max-age-days');
  });
});

describe('buildTrendSeries', () => {
  it('should use the overall pass rate when no suite is given', () => {
    const series = buildTrendSeries(makeEntries());

    expect(series.map((point) => point.passRate)).toEqual([1, 0, 1, 0]);
  });

  it('should use the suite pass rate when a suite is given', () => {
    const series = buildTrendSeries(queryHistory(makeEntries(), { suite: 'safety' }), 'safety');

    expect(series.map((point) => point.passRate)).toEqual([1, 1, 0]);
  });
});
