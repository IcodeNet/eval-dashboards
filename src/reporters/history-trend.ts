/**
 * Static long-range history trend page. Pure function: points -> HTML string.
 * No network, no server. Escapes all interpolated text.
 */
import type { HistoryQuery, TrendPoint } from '../history/query.js';
import { formatDate, formatPassRate } from '../utils/format.js';

const e = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const CHART_WIDTH = 720;
const CHART_HEIGHT = 180;
const CHART_PAD = 24;

const renderChart = (points: TrendPoint[]): string => {
  if (points.length === 0) return '';
  const innerWidth = CHART_WIDTH - CHART_PAD * 2;
  const innerHeight = CHART_HEIGHT - CHART_PAD * 2;
  const x = (index: number): number =>
    points.length === 1 ? CHART_WIDTH / 2 : CHART_PAD + (index / (points.length - 1)) * innerWidth;
  const y = (rate: number): number => CHART_PAD + (1 - rate) * innerHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.passRate).toFixed(1)}`).join(' ');
  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${x(index).toFixed(1)}" cy="${y(point.passRate).toFixed(1)}" r="3"><title>${e(`${point.runId}: ${formatPassRate(point.total - point.failed, point.total)}`)}</title></circle>`,
    )
    .join('');
  const guides = [0, 0.5, 1]
    .map(
      (rate) =>
        `<line x1="${CHART_PAD}" x2="${CHART_WIDTH - CHART_PAD}" y1="${y(rate)}" y2="${y(rate)}" class="guide"/><text x="2" y="${y(rate) + 4}" class="axis">${Math.round(rate * 100)}%</text>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="100%" role="img" aria-label="Pass rate over time">${guides}<path d="${path}" class="line"/>${dots}</svg>`;
};

const describeQuery = (query: HistoryQuery): string => {
  const parts = [
    query.since ? `since ${query.since}` : '',
    query.until ? `until ${query.until}` : '',
    query.branch ? `branch ${query.branch}` : '',
    query.suite ? `suite ${query.suite}` : '',
  ].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(' · ') : 'all runs';
};

export const renderHistoryTrendHtml = (
  points: TrendPoint[],
  query: HistoryQuery,
  options: { generatedAt: string; locale?: string },
): string => {
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.passRate - first.passRate : 0;
  const changeLabel = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)} pts`;
  const rows = [...points]
    .reverse()
    .map(
      (point) =>
        `<tr><td>${e(formatDate(point.generatedAt, options.locale))}</td><td>${e(point.runId)}</td><td>${e(point.branch ?? '')}</td><td class="num">${e(formatPassRate(point.total - point.failed, point.total))}</td><td class="num">${point.failed}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eval history</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7fb; color: #1e293b; margin: 0; }
    .page { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 4px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #d8dde8; border-radius: 10px; padding: 16px 18px; }
    .label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; }
    .value { font-size: 26px; font-weight: 800; }
    .section { background: #fff; border: 1px solid #d8dde8; border-radius: 12px; padding: 16px; margin-bottom: 24px; overflow-x: auto; }
    .line { fill: none; stroke: #6366f1; stroke-width: 2; }
    circle { fill: #6366f1; }
    .guide { stroke: #e2e8f0; }
    .axis { font-size: 10px; fill: #94a3b8; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #eef2f7; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { color: #64748b; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Eval history</h1>
    <p class="subtitle">${e(`Generated ${formatDate(options.generatedAt, options.locale)} · ${describeQuery(query)} · offline, static`)}</p>
    <div class="cards">
      <div class="card"><div class="label">Runs</div><div class="value">${points.length}</div></div>
      <div class="card"><div class="label">Latest pass rate</div><div class="value">${last ? e(formatPassRate(last.total - last.failed, last.total)) : 'n/a'}</div></div>
      <div class="card"><div class="label">Change over range</div><div class="value">${points.length > 1 ? e(changeLabel) : 'n/a'}</div></div>
    </div>
    <div class="section">${points.length > 0 ? renderChart(points) : '<p class="empty">No runs match this query.</p>'}</div>
    <div class="section">
      <table>
        <thead><tr><th>Date</th><th>Run</th><th>Branch</th><th class="num">Pass rate</th><th class="num">Failed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
};
