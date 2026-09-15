import { describe, expect, it } from 'vitest';
import { buildHistory } from '../src/history/history.js';
import { buildOrgRollup, parseHistoryPayload, repoHistoryFromPayload } from '../src/history/org-rollup.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const makeReport = (overrides: Partial<EvalReportV1> = {}): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: {
    id: 'run-1',
    generatedAt: new Date().toISOString(),
    project: 'agent-alpha',
  },
  suites: [],
  rows: [
    { suite: 'suite-a', id: 'row-1', passed: true },
    { suite: 'suite-a', id: 'row-2', passed: true },
  ],
  ...overrides,
});

describe('parseHistoryPayload', () => {
  it('accepts a bare array of history entries', () => {
    const history = buildHistory([makeReport()]);
    const parsed = parseHistoryPayload(history);
    expect(parsed).toHaveLength(1);
  });

  it('accepts a { history: [...] } wrapper shape', () => {
    const history = buildHistory([makeReport()]);
    const parsed = parseHistoryPayload({ history });
    expect(parsed).toHaveLength(1);
  });

  it('rejects malformed payloads', () => {
    expect(() => parseHistoryPayload({ nope: true })).toThrow(/Expected a history JSON array/);
    expect(() => parseHistoryPayload([{ foo: 'bar' }])).toThrow(/Malformed history entry/);
  });
});

describe('repoHistoryFromPayload', () => {
  it('derives the repo label from run.project when present', () => {
    const history = buildHistory([makeReport({ run: { id: 'r1', generatedAt: new Date().toISOString(), project: 'agent-beta' } })]);
    const repoHistory = repoHistoryFromPayload('/tmp/somewhere/history.json', history);
    expect(repoHistory.repo).toBe('agent-beta');
  });

  it('falls back to the parent directory name when project is absent', () => {
    const history = buildHistory([makeReport({ run: { id: 'r1', generatedAt: new Date().toISOString() } })]);
    const repoHistory = repoHistoryFromPayload('/tmp/agent-gamma/history.json', history);
    expect(repoHistory.repo).toBe('agent-gamma');
  });

  it('honors an explicit repo override', () => {
    const history = buildHistory([makeReport()]);
    const repoHistory = repoHistoryFromPayload('/tmp/x/history.json', history, 'explicit-name');
    expect(repoHistory.repo).toBe('explicit-name');
  });
});

describe('buildOrgRollup', () => {
  it('flags a repo whose pass rate dropped as regressed', () => {
    const day1 = makeReport({
      run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z', project: 'agent-alpha' },
      rows: [
        { suite: 's', id: '1', passed: true },
        { suite: 's', id: '2', passed: true },
      ],
    });
    const day2 = makeReport({
      run: { id: 'run-2', generatedAt: '2026-01-02T00:00:00.000Z', project: 'agent-alpha' },
      rows: [
        { suite: 's', id: '1', passed: true },
        { suite: 's', id: '2', passed: false },
      ],
    });
    const history = buildHistory([day1, day2]);
    const repoHistory = repoHistoryFromPayload('/tmp/agent-alpha/history.json', history);

    const summary = buildOrgRollup([repoHistory]);
    expect(summary.totalRepos).toBe(1);
    expect(summary.regressedCount).toBe(1);
    expect(summary.rows[0]?.trend).toBe('regressed');
  });

  it('flags a new critical failure as regressed even without a pass-rate drop', () => {
    const day1 = makeReport({
      run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z', project: 'agent-beta' },
      rows: [{ suite: 's', id: '1', passed: false, severity: 'low' }],
    });
    const day2 = makeReport({
      run: { id: 'run-2', generatedAt: '2026-01-02T00:00:00.000Z', project: 'agent-beta' },
      rows: [{ suite: 's', id: '1', passed: false, severity: 'critical' }],
    });
    const history = buildHistory([day1, day2]);
    const repoHistory = repoHistoryFromPayload('/tmp/agent-beta/history.json', history);

    const summary = buildOrgRollup([repoHistory]);
    expect(summary.rows[0]?.trend).toBe('regressed');
    expect(summary.rows[0]?.criticalFailures).toBe(1);
  });

  it('marks a single-run repo as new', () => {
    const history = buildHistory([makeReport({ run: { id: 'run-1', generatedAt: new Date().toISOString(), project: 'agent-gamma' } })]);
    const repoHistory = repoHistoryFromPayload('/tmp/agent-gamma/history.json', history);
    const summary = buildOrgRollup([repoHistory]);
    expect(summary.rows[0]?.trend).toBe('new');
    expect(summary.regressedCount).toBe(0);
  });

  it('sorts regressed repos first, then by pass rate ascending', () => {
    const stableHistory = buildHistory([
      makeReport({ run: { id: 'r1', generatedAt: '2026-01-01T00:00:00.000Z', project: 'stable-repo' } }),
      makeReport({ run: { id: 'r2', generatedAt: '2026-01-02T00:00:00.000Z', project: 'stable-repo' } }),
    ]);
    const regressedHistory = buildHistory([
      makeReport({
        run: { id: 'r1', generatedAt: '2026-01-01T00:00:00.000Z', project: 'regressed-repo' },
        rows: [{ suite: 's', id: '1', passed: true }],
      }),
      makeReport({
        run: { id: 'r2', generatedAt: '2026-01-02T00:00:00.000Z', project: 'regressed-repo' },
        rows: [{ suite: 's', id: '1', passed: false }],
      }),
    ]);

    const summary = buildOrgRollup([
      repoHistoryFromPayload('/tmp/stable-repo/history.json', stableHistory),
      repoHistoryFromPayload('/tmp/regressed-repo/history.json', regressedHistory),
    ]);

    expect(summary.rows[0]?.repo).toBe('regressed-repo');
    expect(summary.rows[0]?.trend).toBe('regressed');
  });
});
