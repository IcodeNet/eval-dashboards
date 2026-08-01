import path from 'node:path';
import type { RunComparison, RunHistoryEntry } from '../history/history.js';
import {
  summarizeReport,
  type BaselineCompatibilityResult,
  type EvalReportV1,
  type EvalRow,
  type EvalSuiteSummary,
} from '../model/eval-report-v1.js';
import { writeJsonFile, writeTextFile } from '../io/reports.js';
import { formatDate, formatPassRate, formatDuration } from '../utils/format.js';
import {
  resolveTheme,
  renderCssVariables,
  type EvalReportsTheme,
} from './themes.js';

export type ReporterName = 'text' | 'json-summary' | 'markdown-summary' | 'html';

export type ReportContext = {
  current: EvalReportV1;
  previous?: EvalReportV1;
  history: RunHistoryEntry[];
  comparison: RunComparison;
  baselineCompatibility?: BaselineCompatibilityResult;
  reportDir: string;
  theme?: string | Partial<EvalReportsTheme>;
  locale?: string;
};

export const renderReports = async (
  context: ReportContext,
  reporters: ReporterName[],
): Promise<string[]> => {
  const outputs: string[] = [];

  for (const reporter of reporters) {
    if (reporter === 'text') {
      outputs.push(renderText(context));
    } else if (reporter === 'json-summary') {
      const filePath = path.join(context.reportDir, 'summary.json');
      await writeJsonFile(filePath, {
        summary: summarizeReport(context.current),
        comparison: context.comparison,
        baselineCompatibility: context.baselineCompatibility,
      });
      outputs.push(filePath);
    } else if (reporter === 'markdown-summary') {
      const filePath = path.join(context.reportDir, 'summary.md');
      await writeTextFile(filePath, renderMarkdown(context));
      outputs.push(filePath);
    } else if (reporter === 'html') {
      const filePath = path.join(context.reportDir, 'index.html');
      await writeTextFile(filePath, renderHtml(context));
      await writeJsonFile(path.join(context.reportDir, 'history.json'), context.history);
      await writeJsonFile(path.join(context.reportDir, 'summary.json'), {
        summary: summarizeReport(context.current),
        comparison: context.comparison,
        baselineCompatibility: context.baselineCompatibility,
      });
      outputs.push(filePath);
    }
  }

  return outputs;
};

const renderText = (context: ReportContext): string => {
  const summary = summarizeReport(context.current);
  const locale = context.locale;

  return [
    `Run:              ${summary.run.id}`,
    `Generated:        ${formatDate(summary.run.generatedAt, locale)}`,
    `Pass rate:        ${formatPassRate(summary.passed, summary.total)}`,
    `Passed:           ${summary.passed}/${summary.total}`,
    `New failures:     ${context.comparison.newlyFailing.length}`,
    `New passes:       ${context.comparison.newlyPassing.length}`,
    `Baseline:         ${context.baselineCompatibility?.status ?? 'not compared'}`,
  ].join('\n');
};

const renderMarkdown = (context: ReportContext): string => {
  const summary = summarizeReport(context.current);

  return `# Eval Report\n\n| Metric | Value |\n| --- | --- |\n| Run | ${summary.run.id} |\n| Pass rate | ${(summary.passRate * 100).toFixed(1)}% |\n| Passed | ${summary.passed}/${summary.total} |\n| New failures | ${context.comparison.newlyFailing.length} |\n| New passes | ${context.comparison.newlyPassing.length} |\n| Baseline compatibility | ${context.baselineCompatibility?.status ?? 'not compared'} |\n`;
};

const e = (s: unknown): string =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const pctBar = (passed: number, total: number): string => {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return `<span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>`;
};

const suiteRows = (suites: EvalSuiteSummary[]): string =>
  suites
    .map(
      (s) => `<tr>
        <td>${e(s.name ?? s.id)}</td>
        <td class="num">${s.total}</td>
        <td class="num pass">${s.passed}</td>
        <td class="num fail">${s.failed}</td>
        <td class="num">${pctBar(s.passed, s.total)} ${e(formatPassRate(s.passed, s.total))}</td>
      </tr>`,
    )
    .join('');

const failingRowsTable = (rows: EvalRow[]): string => {
  if (!rows.length) return '<p class="empty">No failing rows.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Suite</th><th>Row</th><th>Severity</th><th>Category</th><th>Reason</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr class="fail-row">
      <td>${e(r.suite)}</td>
      <td>${e(r.name ?? r.id)}</td>
      <td><span class="severity sev-${e(r.severity ?? 'none')}">${e(r.severity ?? 'none')}</span></td>
      <td>${e(r.category ?? '')}</td>
      <td class="reason">${e(r.reason ?? '')}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
};

const renderHtml = (context: ReportContext): string => {
  const theme = resolveTheme(context.theme);
  const locale = context.locale;
  const summary = summarizeReport(context.current);
  const run = context.current.run;
  const failingRows = context.current.rows.filter((r) => !r.passed);
  const newlyFailing = context.comparison.newlyFailing;
  const newlyPassing = context.comparison.newlyPassing;
  const compat = context.baselineCompatibility;
  const compatStatus = compat?.status ?? 'not compared';
  const compatClass = compatStatus === 'blocked' ? 'fail' : compatStatus === 'warning' ? 'warn' : 'pass';
  const passClass = summary.passRate >= 0.9 ? 'pass' : summary.passRate >= 0.6 ? 'warn' : 'fail';
  const totalDurationMs = context.current.rows
    .map((r) => Number(r.durationMs))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .reduce((a, b) => a + b, 0);

  return `<!doctype html>
<html lang="en" data-theme="${e(theme.name)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eval Report — ${e(run.id)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      color-scheme: ${theme.colorScheme};
${renderCssVariables(theme)}
    }
    body { font-family: var(--font); background: var(--bg); color: var(--ink); font-size: 15px; line-height: 1.6; }
    a { color: var(--accent); }

    /* ── Banner ── */
    .banner { background: var(--banner-bg); color: var(--banner-ink); padding: 36px 32px 28px; }
    .banner-inner { max-width: 1200px; margin: 0 auto; }
    .banner p { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--banner-muted); margin-bottom: 6px; }
    .banner h1 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; line-height: 1.1; }
    .banner-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 16px; font-size: 12px; color: var(--banner-muted); }
    .banner-meta span { display: flex; align-items: center; gap: 5px; }

    /* ── Layout ── */
    .page { max-width: 1200px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ── Metric cards ── */
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }
    .metric { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); }
    .metric-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
    .metric-value { font-size: 28px; font-weight: 800; line-height: 1; }
    .metric-value.pass { color: var(--pass); }
    .metric-value.fail { color: var(--fail); }
    .metric-value.warn { color: var(--warn); }

    /* ── Sections ── */
    .section { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 20px; overflow: hidden; }
    .section-header { padding: 16px 20px; border-bottom: 1px solid var(--line); background: var(--surface-muted); display: flex; align-items: center; justify-content: space-between; }
    .section-header h2 { font-size: 13px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
    .section-body { padding: 0; }

    /* ── Tables ── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--surface-muted); border-bottom: 1px solid var(--line); white-space: nowrap; }
    tbody td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--surface-muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pass { color: var(--pass); font-weight: 700; }
    .fail { color: var(--fail); font-weight: 700; }
    .empty { padding: 16px 20px; color: var(--muted); font-style: italic; font-size: 13px; }

    /* ── Pass-rate bar ── */
    .bar-track { display: inline-block; width: 52px; height: 5px; border-radius: 3px; background: var(--line); vertical-align: middle; margin-right: 6px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--pass); }

    /* ── Severity chips ── */
    .severity { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .sev-none { background: var(--surface-muted); color: var(--muted); }
    .sev-low { background: var(--accent-soft); color: var(--accent); }
    .sev-medium { background: var(--warn-soft); color: var(--warn); }
    .sev-high, .sev-critical { background: var(--fail-soft); color: var(--fail); }

    /* ── Compat badge ── */
    .compat-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .compat-pass { background: var(--pass-soft); color: var(--pass); }
    .compat-warn { background: var(--warn-soft); color: var(--warn); }
    .compat-fail { background: var(--fail-soft); color: var(--fail); }

    .reason { font-family: var(--font-mono); font-size: 12px; max-width: 340px; word-break: break-word; color: var(--muted); }

    /* ── Footer ── */
    footer { text-align: center; color: var(--muted); font-size: 11px; padding: 24px 0 0; }
    footer a { color: var(--muted); }
  </style>
</head>
<body>
  <div class="banner">
    <div class="banner-inner">
      <p>Eval report</p>
      <h1>${e(run.project ?? run.id)}</h1>
      <div class="banner-meta">
        <span>Run&nbsp;<strong>${e(run.id)}</strong></span>
        <span>${e(formatDate(run.generatedAt, locale))}</span>
        ${run.branch ? `<span>Branch&nbsp;<strong>${e(run.branch)}</strong></span>` : ''}
        ${run.commit ? `<span>Commit&nbsp;<strong>${e(run.commit)}</strong></span>` : ''}
        ${run.buildId ? `<span>Build&nbsp;<strong>${e(run.buildId)}</strong></span>` : ''}
        ${totalDurationMs > 0 ? `<span>Duration&nbsp;<strong>${e(formatDuration(totalDurationMs))}</strong></span>` : ''}
      </div>
    </div>
  </div>

  <div class="page">
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Pass rate</div>
        <div class="metric-value ${passClass}">${e(formatPassRate(summary.passed, summary.total))}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Passed</div>
        <div class="metric-value">${summary.passed}<span style="font-size:16px;font-weight:400;color:var(--muted)">/${summary.total}</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">New failures</div>
        <div class="metric-value ${newlyFailing.length > 0 ? 'fail' : 'pass'}">${newlyFailing.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">New passes</div>
        <div class="metric-value ${newlyPassing.length > 0 ? 'pass' : ''}">${newlyPassing.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Baseline</div>
        <div class="metric-value" style="font-size:15px;padding-top:5px">
          <span class="compat-badge compat-${compatClass}">${e(compatStatus)}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Suite summary</h2></div>
      <div class="section-body">
        <div class="table-wrap"><table>
          <thead><tr><th>Suite</th><th class="num">Total</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Pass rate</th></tr></thead>
          <tbody>${suiteRows(context.current.suites)}</tbody>
        </table></div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Failing rows</h2>
        <span style="font-size:12px;color:var(--muted)">${failingRows.length} row${failingRows.length === 1 ? '' : 's'}</span>
      </div>
      <div class="section-body">${failingRowsTable(failingRows)}</div>
    </div>

    ${
      compat?.issues.length
        ? `<div class="section">
      <div class="section-header"><h2>Baseline compatibility</h2></div>
      <div class="section-body"><div class="table-wrap"><table>
        <thead><tr><th>Suite</th><th>Severity</th><th>Issue</th><th>Dataset</th><th>Rubric</th></tr></thead>
        <tbody>${compat.issues
          .map(
            (i) => `<tr>
          <td>${e(i.suite)}</td>
          <td><span class="severity sev-${i.severity === 'blocking' ? 'critical' : 'medium'}">${e(i.severity)}</span></td>
          <td class="reason">${e(i.reason)}</td>
          <td>${e([i.baselineDatasetVersion, i.candidateDatasetVersion].filter(Boolean).join(' → '))}</td>
          <td>${e([i.baselineRubricVersion, i.candidateRubricVersion].filter(Boolean).join(' → '))}</td>
        </tr>`,
          )
          .join('')}</tbody>
      </table></div></div>
    </div>`
        : ''
    }

    <footer>
      Generated by <a href="https://github.com/icodenet/eval-dashboards" target="_blank" rel="noopener">@icodenet/eval-dashboards</a>
    </footer>
  </div>
</body>
</html>`;
};