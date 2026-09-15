/**
 * 4F.8 — Static org rollup HTML renderer.
 *
 * Pure function: OrgRollupSummary -> HTML string. No network, no server, no
 * ingestion API. Escapes all interpolated text per AGENTS.md.
 */
import type { OrgRollupRow, OrgRollupSummary } from '../history/org-rollup.js';
import { formatDate, formatPassRate } from '../utils/format.js';

const e = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const trendLabel = (trend: OrgRollupRow['trend']): string => {
  switch (trend) {
    case 'regressed':
      return 'Regressed';
    case 'improved':
      return 'Improved';
    case 'new':
      return 'New';
    default:
      return 'Stable';
  }
};

const trendClass = (trend: OrgRollupRow['trend']): string => {
  switch (trend) {
    case 'regressed':
      return 'fail';
    case 'improved':
      return 'pass';
    case 'new':
      return 'muted';
    default:
      return 'warn';
  }
};

const sparkline = (rates: number[], width = 90, height = 24): string => {
  if (rates.length === 0) return '';
  if (rates.length === 1) {
    const y = height - rates[0]! * (height - 4) - 2;
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline"><line x1="5" y1="${y}" x2="${width - 5}" y2="${y}" stroke="currentColor" stroke-width="2" opacity="0.6" /></svg>`;
  }
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1;
  const spacing = (width - 10) / (rates.length - 1);
  const points = rates.map((rate, i) => {
    const x = 5 + i * spacing;
    const y = height - 2 - ((rate - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline"><path d="${d}" stroke="currentColor" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke" /></svg>`;
};

const deltaText = (delta: number | undefined): string => {
  if (delta === undefined) return 'n/a';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(1)}pp`;
};

const rowHtml = (row: OrgRollupRow, locale?: string): string => {
  const rates = row.latest ? [] : [];
  const passRates = row.previous ? [row.previous.passRate, row.passRate] : [row.passRate];
  void rates;
  return `<tr class="rollup-row trend-${e(row.trend)}">
    <td class="col-repo"><div class="repo-name">${e(row.repo)}</div><div class="repo-source muted">${e(row.sourcePath)}</div></td>
    <td><span class="trend-badge trend-badge-${trendClass(row.trend)}">${e(trendLabel(row.trend))}</span></td>
    <td class="num">${e(formatPassRate(Math.round(row.passRate * (row.latest?.total ?? 0)), row.latest?.total ?? 0))}</td>
    <td class="num">${sparkline(passRates)} ${e(deltaText(row.passRateDelta))}</td>
    <td class="num ${row.criticalFailures > 0 ? 'fail' : ''}">${row.criticalFailures}</td>
    <td class="num ${row.newlyFailing > 0 ? 'fail' : ''}">${row.newlyFailing}</td>
    <td class="num ${row.persistentFailures > 0 ? 'warn' : ''}">${row.persistentFailures}</td>
    <td class="num">${row.runCount}</td>
    <td class="muted">${row.generatedAt ? e(formatDate(row.generatedAt, locale)) : 'n/a'}</td>
  </tr>`;
};

export const renderOrgRollupHtml = (summary: OrgRollupSummary, locale?: string): string => {
  const rowsHtml = summary.rows.map((row) => rowHtml(row, locale)).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Org eval rollup</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #f7f8fb; color: #0f172a; margin: 0; }
    .page { max-width: 1280px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 26px; font-weight: 800; margin-bottom: 6px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .summary-card { background: #fff; border: 1px solid #d8dde8; border-radius: 10px; padding: 16px 18px; }
    .summary-card .label { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .summary-card .value { font-size: 26px; font-weight: 800; }
    .summary-card .value.fail { color: #b91c1c; }
    .section { background: #fff; border: 1px solid #d8dde8; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 14px; border-bottom: 1px solid #eef2f7; text-align: left; vertical-align: middle; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: .05em; background: #f8fafc; white-space: nowrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: #64748b; font-size: 12px; }
    .fail { color: #b91c1c; font-weight: 700; }
    .warn { color: #b45309; font-weight: 700; }
    .pass { color: #0f766e; font-weight: 700; }
    .col-repo { min-width: 220px; }
    .repo-name { font-weight: 700; }
    .repo-source { font-family: ui-monospace, monospace; font-size: 11px; }
    .trend-badge { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .trend-badge-fail { background: #fee2e2; color: #b91c1c; }
    .trend-badge-pass { background: #d1fae5; color: #0f766e; }
    .trend-badge-warn { background: #fef3c7; color: #b45309; }
    .trend-badge-muted { background: #e2e8f0; color: #475569; }
    .sparkline { color: #6366f1; opacity: .85; vertical-align: middle; margin-right: 6px; }
    footer { text-align: center; color: #94a3b8; font-size: 11px; padding: 24px 0 0; }
    .empty { padding: 20px; color: #64748b; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Org eval rollup</h1>
    <p class="subtitle">${e(`Generated ${formatDate(summary.generatedAt, locale)} · ${summary.totalRepos} repo${summary.totalRepos === 1 ? '' : 's'} · offline, static — built from locally published history.json files`)}</p>

    <div class="summary-cards">
      <div class="summary-card"><div class="label">Repos tracked</div><div class="value">${summary.totalRepos}</div></div>
      <div class="summary-card"><div class="label">Regressed this run</div><div class="value ${summary.regressedCount > 0 ? 'fail' : ''}">${summary.regressedCount}</div></div>
    </div>

    <div class="section">
      <table>
        <thead><tr>
          <th>Repo / agent</th>
          <th>Trend</th>
          <th class="num">Pass rate</th>
          <th class="num">Δ vs previous</th>
          <th class="num">Critical fails</th>
          <th class="num">New failures</th>
          <th class="num">Persistent fails</th>
          <th class="num">Runs</th>
          <th>Latest run</th>
        </tr></thead>
        <tbody>${rowsHtml || ''}</tbody>
      </table>
      ${summary.rows.length === 0 ? '<p class="empty">No history artifacts found. Point --input at a directory of published history.json files.</p>' : ''}
    </div>

    <footer>Generated by <a href="https://github.com/icodenet/eval-dashboards" target="_blank" rel="noopener">@icodenet/eval-dashboards</a> — static, offline, no ingestion API.</footer>
  </div>
</body>
</html>`;
};
