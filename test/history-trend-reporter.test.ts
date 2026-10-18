import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '../src/history/query.js';
import { renderHistoryTrendHtml } from '../src/reporters/history-trend.js';

const hostile = '</td><script>alert(1)</script>"\'&';

const makePoint = (overrides: Partial<TrendPoint> = {}): TrendPoint => ({
  runId: 'run-1',
  generatedAt: '2026-10-01T09:00:00.000Z',
  branch: 'main',
  passRate: 0.9,
  total: 10,
  failed: 1,
  ...overrides,
});

describe('renderHistoryTrendHtml', () => {
  it('should escape the run id when it contains markup', () => {
    const html = renderHistoryTrendHtml([makePoint({ runId: hostile })], {});

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should escape the branch name when it contains markup', () => {
    const html = renderHistoryTrendHtml([makePoint({ branch: hostile })], {});

    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('should escape the branch and suite filters shown in the subtitle when they contain markup', () => {
    const html = renderHistoryTrendHtml([makePoint()], { branch: hostile, suite: hostile });

    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('should show the filters that were applied when a query is given', () => {
    const html = renderHistoryTrendHtml([makePoint()], { since: '2026-01-01', branch: 'main', suite: 'safety' });

    expect(html).toContain('since 2026-01-01 · branch main · suite safety');
  });

  it('should say no runs match when the list is empty', () => {
    const html = renderHistoryTrendHtml([], {});

    expect(html).toContain('No runs match this query.');
  });

  it('should list the last point first in the table when points are given oldest to newest', () => {
    const html = renderHistoryTrendHtml(
      [makePoint({ runId: 'older' }), makePoint({ runId: 'newer', generatedAt: '2026-10-08T09:00:00.000Z' })],
      {},
    );
    const tableBody = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));

    expect(tableBody.indexOf('newer')).toBeLessThan(tableBody.indexOf('older'));
  });

  it('should show the change over the range in percentage points when there are two runs', () => {
    const html = renderHistoryTrendHtml(
      [makePoint({ passRate: 0.5 }), makePoint({ runId: 'run-2', passRate: 0.75 })],
      {},
    );

    expect(html).toContain('+25.0 pts');
  });
});
