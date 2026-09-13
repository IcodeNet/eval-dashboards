import { describe, expect, it } from 'vitest';
import { EVAL_REPORT_SCHEMA_VERSION, type EvalReportV1 } from '../src/model/eval-report-v1.js';
import { buildHistory, compareRuns } from '../src/history/history.js';

const makeReport = (
  runId: string,
  generatedAt: string,
  rows: EvalReportV1['rows'],
  suiteManifests?: EvalReportV1['suiteManifests'],
): EvalReportV1 => ({
  schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
  run: { id: runId, generatedAt },
  suites: [{ id: 'safety', total: rows.length, passed: rows.filter((r) => r.passed).length, failed: rows.filter((r) => !r.passed).length }],
  rows,
  suiteManifests,
});

describe('history v2 enrichment', () => {
  it('builds dimensional trend buckets and regression counters', () => {
    const previous = makeReport(
      'run-1',
      '2026-01-01T00:00:00.000Z',
      [
        { id: 'a', suite: 'safety', kind: 'agent', passed: true },
        { id: 'b', suite: 'safety', kind: 'llm-judge', passed: false },
      ],
      [
        {
          name: 'safety',
          target: 'agent',
          datasetSource: 'manual',
          datasetVersion: 'v1',
          riskArea: 'content-safety',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 1 } },
        },
      ],
    );

    const current = makeReport(
      'run-2',
      '2026-01-02T00:00:00.000Z',
      [
        { id: 'a', suite: 'safety', kind: 'agent', passed: false },
        { id: 'b', suite: 'safety', kind: 'llm-judge', passed: true },
      ],
      [
        {
          name: 'safety',
          target: 'agent',
          datasetSource: 'manual',
          datasetVersion: 'v1',
          riskArea: 'content-safety',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 1 } },
        },
      ],
    );

    const history = buildHistory([current, previous]);
    expect(history).toHaveLength(2);

    const latest = history[1]!;
    expect(latest.bySuite.safety).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(latest.byKind.agent).toMatchObject({ total: 1, passed: 0, failed: 1 });
    expect(latest.byRiskArea['content-safety']).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(latest.regression).toMatchObject({
      newlyFailing: 1,
      newlyPassing: 1,
      persistentFailures: 0,
      disappeared: 0,
    });
    expect(latest.rowStability).toHaveProperty('stable');
    expect(latest.rowStability).toHaveProperty('flaky');
    expect(latest.rowStability).toHaveProperty('persistentFailure');
  });

  it('keeps missing kind rows in an explicit unspecified bucket', () => {
    const report = makeReport('run-1', '2026-01-01T00:00:00.000Z', [
      { id: 'no-kind', suite: 'safety', passed: true },
    ]);

    const history = buildHistory([report]);
    expect(history[0]?.byKind.unspecified).toMatchObject({ total: 1, passed: 1, failed: 0 });
  });

  it('captures disappeared rows in run comparison', () => {
    const previous = makeReport('run-prev', '2026-01-01T00:00:00.000Z', [
      { id: 'kept', suite: 'safety', passed: true },
      { id: 'gone', suite: 'safety', passed: false },
    ]);

    const current = makeReport('run-cur', '2026-01-02T00:00:00.000Z', [
      { id: 'kept', suite: 'safety', passed: true },
    ]);

    const comparison = compareRuns(current, previous);
    expect(comparison.disappeared).toHaveLength(1);
    expect(comparison.disappeared[0]).toMatchObject({ id: 'gone', suite: 'safety' });
  });
});
