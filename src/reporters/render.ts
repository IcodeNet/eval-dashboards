import path from 'node:path';
import { createHash } from 'node:crypto';
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

type GroupedIndexGroup = {
  target: string;
  reports: EvalReportV1[];
  total: number;
  passed: number;
  failed: number;
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
  const { locale } = context;
  const summary = summarizeReport(context.current);

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
  const changelogCount = context.current.datasetChangelog?.length ?? 0;
  const provenance = reportProvenance(context.current);
  const lines = [
    '# Eval Report',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Run | ${summary.run.id} |`,
    `| Pass rate | ${(summary.passRate * 100).toFixed(1)}% |`,
    `| Passed | ${summary.passed}/${summary.total} |`,
    `| New failures | ${context.comparison.newlyFailing.length} |`,
    `| New passes | ${context.comparison.newlyPassing.length} |`,
    `| Baseline compatibility | ${context.baselineCompatibility?.status ?? 'not compared'} |`,
    `| Provenance | ${provenance.label} |`,
    `| Dataset changelog entries | ${changelogCount} |`,
  ];

  if (summary.run.branch) lines.push(`| Branch | ${summary.run.branch} |`);
  if (summary.run.commit) lines.push(`| Commit | ${summary.run.commit} |`);
  if (summary.run.buildId) lines.push(`| Build | ${summary.run.buildId} |`);

  lines.push('');

  const newlyFailing = context.comparison.newlyFailing;
  const newlyPassing = context.comparison.newlyPassing;

  if (newlyFailing.length > 0) {
    lines.push(`## Newly failing (${newlyFailing.length})`, '');
    for (const row of newlyFailing) {
      lines.push(`- ${row.suite}/${row.id}: ${row.category ?? 'uncategorized'}${row.reason ? ` — ${row.reason}` : ''}`);
    }
    lines.push('');
  }

  if (newlyPassing.length > 0) {
    lines.push(`## Newly passing (${newlyPassing.length})`, '');
    for (const row of newlyPassing) {
      lines.push(`- ${row.suite}/${row.id}: ${row.category ?? 'uncategorized'}`);
    }
    lines.push('');
  }

  if (newlyFailing.length === 0 && newlyPassing.length === 0) {
    lines.push('## Diff vs previous run', '', 'No row flips detected.', '');
  }

  return lines.join('\n');
};

const reportProvenance = (
  report: EvalReportV1,
): { label: string; className: 'deterministic' | 'legacy' } => {
  const manifests = report.suiteManifests;
  if (!manifests || manifests.length === 0) {
    return { label: 'legacy: manifest metadata missing', className: 'legacy' };
  }

  if (manifests.length === 1) {
    const manifest = manifests[0];
    const rubric = manifest?.rubricVersion ?? 'n/a';
    return { label: `ds${manifest?.datasetVersion ?? 'n/a'} / rb${rubric}`, className: 'deterministic' };
  }

  const stable = [...manifests].sort((left, right) => left.name.localeCompare(right.name));
  const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 8);
  return { label: `manifest hash ${hash}`, className: 'deterministic' };
};

const toSourceHref = (sourcePath: string): string => {
  const trimmed = sourcePath.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `../${trimmed.replace(/^\.?\//, '')}`;
};

const sourceLink = (sourcePath: string): string => {
  const href = toSourceHref(sourcePath);
  return `<a href="${e(href)}" target="_blank" rel="noopener">${e(sourcePath)}</a>`;
};

const gatePolicyTable = (report: EvalReportV1): string => {
  const manifests = report.suiteManifests ?? [];
  if (!manifests.length) return '<p class="empty">No suite manifest metadata.</p>';

  const rubricContractsBySuite = new Map(
    (report.rubricContracts ?? []).map((contract) => [contract.suiteName, contract]),
  );

  return `<div class="table-wrap"><table>
    <thead><tr>
      ${th('Suite', 'Suite identifier for this policy row.')}
      ${th('Dataset source', 'Dataset source link or path when provided.')}
      ${th('Dataset', 'Dataset version declared in suite manifest.')}
      ${th('Rubric', 'Rubric version declared in suite manifest.')}
      ${th('Rubric sources', 'Registered rubric source files for this suite when provided.')}
      ${th('Risk area', 'Governance risk area for this suite.')}
      ${th('Gate', 'Gate mode for this suite.')}
      ${th('Thresholds', 'Blocking/report-only threshold keys for this suite.')}
    </tr></thead>
    <tbody>${manifests
      .map((manifest) => {
        const contract = rubricContractsBySuite.get(manifest.name);
        const thresholds = Object.entries(manifest.gate.thresholds)
          .map(([name, value]) => `${name}=${Number.isFinite(value) ? value.toFixed(3) : String(value)}`)
          .join(', ');
        const rubricSources =
          contract?.rubrics
            .map((rubric) => (rubric.sourcePath ? sourceLink(rubric.sourcePath) : e(rubric.axis)))
            .join('<br>') ??
          '<span class="muted">n/a</span>';

        return `<tr>
          <td>${e(manifest.name)}</td>
          <td>${manifest.datasetPath ? sourceLink(manifest.datasetPath) : '<span class="muted">n/a</span>'}</td>
          <td>${e(manifest.datasetVersion)}</td>
          <td>${e(manifest.rubricVersion ?? 'n/a')}</td>
          <td>${rubricSources}</td>
          <td>${e(manifest.riskArea)}</td>
          <td>${e(manifest.gate.mode)}</td>
          <td class="reason">${e(thresholds || 'n/a')}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
};

const metadataCards = (run: EvalReportV1['run'], totalDurationMs: number): string => {
  const cards: Array<{ label: string; value: string; tip: string }> = [];
  cards.push({ label: 'Generated', value: run.generatedAt, tip: 'When this report run was generated.' });
  if (run.buildId) cards.push({ label: 'Build', value: run.buildId, tip: 'Build identifier recorded by the eval runner.' });
  if (run.branch) cards.push({ label: 'Branch', value: run.branch, tip: 'Git branch recorded by the eval runner.' });
  if (run.commit) cards.push({ label: 'Commit', value: run.commit, tip: 'Git commit recorded by the eval runner.' });
  if (run.sourceUrl) cards.push({ label: 'Source', value: run.sourceUrl, tip: 'Source CI/job URL for this run when available.' });
  if (totalDurationMs > 0) {
    cards.push({
      label: 'Reported duration',
      value: formatDuration(totalDurationMs),
      tip: 'Sum of row durations in this artifact.',
    });
  }

  return `<div class="meta-grid">${cards
    .map(
      (card) => `<div class="meta-card"><div class="meta-label" data-tip="${e(card.tip)}">${e(card.label)}</div><div class="meta-value">${e(card.value)}</div></div>`,
    )
    .join('')}</div>`;
};

const renderHowToRead = (): string => `<div class="reference-grid">
  <div class="reference-item"><h3>Provenance</h3><p>Shows dataset/rubric identity (ds/rb) for single-suite reports or manifest hash for multi-suite runs.</p></div>
  <div class="reference-item"><h3>Baseline</h3><p>Compatible means trend comparisons are safe; warning or blocked means review diff results with caution.</p></div>
  <div class="reference-item"><h3>Gate policy</h3><p>Threshold keys come from suite manifests and define merge-blocking expectations for each suite.</p></div>
  <div class="reference-item"><h3>Failing rows</h3><p>Focus this section first for actionable regressions and root-cause context.</p></div>
</div>`;

const inferGroupTarget = (report: EvalReportV1): string => {
  if (report.run.kind) return report.run.kind;
  const targets = Array.from(new Set((report.suiteManifests ?? []).map((manifest) => manifest.target)));
  if (targets.length === 1) return targets[0] ?? 'custom';
  if (targets.length > 1) return 'mixed';
  return 'custom';
};

export const renderGroupedIndexHtml = (
  reports: EvalReportV1[],
  locale?: string,
): string => {
  const sorted = [...reports].sort((left, right) => right.run.generatedAt.localeCompare(left.run.generatedAt));
  const groups = new Map<string, GroupedIndexGroup>();

  for (const report of sorted) {
    const key = inferGroupTarget(report);
    const summary = summarizeReport(report);
    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(report);
      existing.total += summary.total;
      existing.passed += summary.passed;
      existing.failed += summary.failed;
      continue;
    }
    groups.set(key, {
      target: key,
      reports: [report],
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
    });
  }

  const groupHtml = [...groups.values()]
    .sort((left, right) => left.target.localeCompare(right.target))
    .map((group) => {
      const passRate = group.total > 0 ? `${((group.passed / group.total) * 100).toFixed(1)}%` : 'n/a';
      return `<div class="section">
        <div class="section-header"><h2>${e(group.target)} (${group.reports.length} report${group.reports.length === 1 ? '' : 's'})</h2></div>
        <div class="section-body" style="padding:16px 20px">
          <p class="muted" style="margin-bottom:12px">${e(`${group.failed} failing / ${group.total} total · pass rate ${passRate}`)}</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Run</th><th>Generated</th><th>Provenance</th><th>Pass rate</th><th>Failed</th></tr></thead>
            <tbody>${group.reports
          .map((report) => {
            const summary = summarizeReport(report);
            const provenance = reportProvenance(report);
            return `<tr>
                  <td>${e(report.run.id)}</td>
                  <td>${e(formatDate(report.run.generatedAt, locale))}</td>
                  <td>${e(provenance.label)}</td>
                  <td>${e(formatPassRate(summary.passed, summary.total))}</td>
                  <td class="num ${summary.failed > 0 ? 'fail' : 'pass'}">${summary.failed}</td>
                </tr>`;
          })
          .join('')}</tbody>
          </table></div>
        </div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eval Report Index</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #f7f8fb; color: #0f172a; margin: 0; }
    .page { max-width: 1200px; margin: 0 auto; padding: 28px 20px 48px; }
    .section { background: #fff; border: 1px solid #d8dde8; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
    .section-header { padding: 14px 16px; border-bottom: 1px solid #e7ebf2; background: #f8fafc; }
    .section-header h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 12px; border-bottom: 1px solid #eef2f7; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: .05em; background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pass { color: #0f766e; font-weight: 700; }
    .fail { color: #b91c1c; font-weight: 700; }
    .muted { color: #64748b; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Eval report index</h1>
    <p class="muted">${e(`Generated ${formatDate(new Date().toISOString(), locale)} · ${reports.length} report${reports.length === 1 ? '' : 's'}`)}</p>
    ${groupHtml || '<p class="muted">No reports found.</p>'}
  </div>
</body>
</html>`;
};

const e = (s: unknown): string =>
  sanitizeForDashboardOutput(String(s ?? ''))
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const FORBIDDEN_OUTPUT_TOKENS = [/\bflagstone\b/gi];
const REDACTED_TOKEN = '[redacted]';

function sanitizeForDashboardOutput(input: string): string {
  return FORBIDDEN_OUTPUT_TOKENS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, REDACTED_TOKEN),
    input,
  );
}

// Renders a column header with an inline ⓘ tooltip
const th = (label: string, tip: string, cls = ''): string =>
  `<th class="${cls}"><span class="th-tip">${label}<i class="info-icon" data-tip="${e(tip)}">i</i></span></th>`;

const pctBar = (passed: number, total: number): string => {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return `<span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>`;
};

// ── Taxonomy Completeness ──

const taxonomyCompleteness = (row: EvalRow): {
  score: number;
  missing: string[];
} => {
  const missing: string[] = [];

  // Core classification fields
  if (!row.kind) missing.push('kind');
  if (!row.severity) missing.push('severity');
  if (!row.category) missing.push('category');

  // Versioning
  if (!row.datasetId) missing.push('datasetId');
  if (!row.scenarioId) missing.push('scenarioId');
  if (!row.rubricId) missing.push('rubricId');

  // Evidence depends on kind
  if (row.kind === 'agent' && !row.turns) missing.push('turns');
  if (row.kind === 'agent' && !row.toolCalls) missing.push('toolCalls');
  if (row.kind === 'llm-judge' && row.judgeVerdict === undefined) missing.push('judgeVerdict');
  if (row.kind === 'llm-judge' && !row.axisScores) missing.push('axisScores');

  // Score: 1.0 if complete, otherwise penalize per missing field
  const maxFields = 9; // kind + severity + category + dataset + scenario + rubric + turns + judge + scores
  const score = Math.max(0, 1 - (missing.length / maxFields));

  return { score: Math.round(score * 100) / 100, missing };
};

// ── Row Grouping ──

type GroupKey = {
  dataset?: string;
  scenario?: string;
  rubric?: string;
  kind?: string;
};

const groupRows = (
  rows: EvalRow[],
  groupBy: ('dataset' | 'scenario' | 'rubric' | 'kind')[] = ['dataset', 'scenario']
): Map<string, EvalRow[]> => {
  const groups = new Map<string, EvalRow[]>();

  rows.forEach((row) => {
    const key = groupBy
      .map((field) => {
        switch (field) {
          case 'dataset':
            return `dataset:${row.datasetId || 'unspecified'}`;
          case 'scenario':
            return `scenario:${row.scenarioId || 'unspecified'}`;
          case 'rubric':
            return `rubric:${row.rubricId || 'unspecified'}`;
          case 'kind':
            return `kind:${row.kind || 'unknown'}`;
        }
      })
      .join('|');

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  return groups;
};

// ── Row detail panel (expanded view) ──

const renderRowDetail = (r: EvalRow, colSpan: number): string => {
  const fields: string[] = [];

  const field = (label: string, value: string | undefined | null, mono = false, full = false) => {
    if (!value) return;
    fields.push(`<div class="detail-field${full ? ' full-width' : ''}">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value${mono ? ' mono' : ''}">${e(value)}</span>
    </div>`);
  };

  field('Input', r.input, true, true);
  field('Output', r.output, true, true);
  field('Expected', r.expected, true, true);
  field('Ground truth category', r.groundTruthCategory, false, false);
  field('Ground truth annotation', r.groundTruthAnnotation, true, true);
  field('Judge model', r.judgeModel);
  field('Judge verdict', r.judgeVerdict != null ? String(r.judgeVerdict) : null);
  field('Judge reasoning', r.judgeReasoning, true, true);

  if (r.axisScores && Object.keys(r.axisScores).length) {
    const chips = Object.entries(r.axisScores)
      .map(([k, v]) => `<span class="axis-score-chip">${e(k)}: ${typeof v === 'number' ? v.toFixed(2) : e(String(v))}</span>`)
      .join('');
    fields.push(`<div class="detail-field full-width">
      <span class="detail-field-label">Axis scores</span>
      <div class="axis-scores">${chips}</div>
    </div>`);
  }

  if (r.toolCalls?.length) {
    fields.push(`<div class="detail-field full-width">
      <span class="detail-field-label">Tool calls</span>
      <div class="axis-scores">${r.toolCalls.map((t) => `<span class="axis-score-chip">${e(t.name)}</span>`).join('')}</div>
    </div>`);
  }

  field('Turns', r.turns != null ? String(r.turns) : null);
  field('Duration', r.durationMs != null ? `${r.durationMs} ms` : null);
  field('Agent version', r.agentVersion);
  field('Prompt version', r.promptVersion);
  field('Rubric ID', r.rubricId);
  field('Category', r.category);

  if (!fields.length) return '';
  return `<tr class="detail-row"><td colspan="${colSpan}"><div class="detail-panel">${fields.join('')}</div></td></tr>`;
};

// ── Grouped rows table with taxonomy completeness ──

const groupedRowsTable = (rows: EvalRow[], showTaxonomy = true): string => {
  if (!rows.length) return '<p class="empty">No rows.</p>';

  const groups = groupRows(rows);
  let html = '';

  for (const [groupKey, groupRows] of groups) {
    const keyParts = groupKey.split('|').map((p) => p.split(':').slice(1).join(':'));
    const [dataset, scenario] = keyParts;

    html += `
    <div class="row-group">
      <div class="group-header">
        <h3>${dataset ? `Dataset: ${e(dataset)}` : 'Unspecified dataset'}</h3>
        ${scenario ? `<span class="group-label">Scenario: ${e(scenario)}</span>` : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          ${th('Row', 'One eval case — a single input/output pair evaluated against a rubric.\nThe name is human-readable; the ID below it is stable across runs (used for regression tracking).\nExample: "Clear answer" with id clear-answer-001')}
          ${showTaxonomy ? th('Score', 'How completely this row fills the recommended taxonomy fields.\n100% = all fields present (kind, severity, category, datasetId, scenarioId, rubricId + evidence).\nLow scores reduce the value of gates and trend comparisons.\nHover the score chip to see which fields are missing.', 'col-tax') : ''}
          ${th('Kind', 'How this case was evaluated:\n• deterministic — rule-based, no LLM (fast, free, reliable). Example: regex match, JSON schema check.\n• llm-judge — scored by an LLM grader. Example: GPT-4o rates answer relevance 0–1.\n• agent — live agent run; checks tool calls, turn count, latency.\n• human-review — a human labelled this case manually.', 'col-kind')}
          ${th('Severity', 'How bad is this failure for the end user?\n• none — passing, or a cosmetic issue\n• low — minor quality gap, user not blocked\n• medium — noticeable degradation (e.g. answer too vague)\n• high — user goal blocked (e.g. wrong information returned)\n• critical — safety or compliance risk; gate with --zero-critical', 'col-sev')}
          ${th('Reason', 'Why this row failed, as set by the runner or LLM judge.\nExample: "The answer was too verbose" or "Expected tool search_kb was not called".\nUsed for debugging and triage — aim for actionable messages.')}
        </tr></thead>
        <tbody>${groupRows
        .map((r) => {
          const tax = taxonomyCompleteness(r);
          const colSpan = showTaxonomy ? 5 : 4;
          const detail = renderRowDetail(r, colSpan);
          const hasDetail = detail.length > 0;
          return `<tr class="data-row${r.passed ? '' : ' fail-row'}"${hasDetail ? ` onclick="toggleRow(this)"` : ''}>
          <td class="col-row">${hasDetail ? '<span class="expand-toggle">▶</span>' : ''}<div class="row-name"><span class="row-name-label">${e(r.name ?? r.id)}</span>${r.name ? `<span class="row-name-id">${e(r.id)}</span>` : ''}</div></td>
          ${showTaxonomy ? `<td class="col-tax taxonomy-score"><span class="score ${tax.score >= 0.8 ? 'complete' : tax.score >= 0.5 ? 'partial' : 'incomplete'}" data-tip="${tax.missing.length ? 'Missing fields:\n' + e(tax.missing.join('\n')) : 'All recommended fields present'}">${Math.round(tax.score * 100)}%</span></td>` : ''}
          <td class="col-kind"><span class="kind-badge kind-${e(r.kind || 'unknown')}">${e(r.kind ?? 'unknown')}</span></td>
          <td class="col-sev"><span class="severity sev-${e(r.severity ?? 'none')}">${e(r.severity ?? 'none')}</span></td>
          <td class="col-reason reason">${e(r.reason ?? '')}</td>
        </tr>${detail}`;
        })
        .join('')}</tbody>
      </table></div>
    </div>`;
  }

  return html;
};

const flatRowsTable = (rows: EvalRow[]): string => {
  if (!rows.length) return '<p class="empty">No rows.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr>
      ${th('Row', 'One eval case. Name is human-readable; stable ID below is used for regression tracking across runs.')}
      ${th('Suite', 'The suite this row belongs to. Suites group rows by risk area, model, or scenario type.')}
      ${th('Passed', '✓ = row met its pass threshold this run. ✗ = failed. Gates count failures across all rows.')}
      ${th('Score', 'Taxonomy completeness (0–100%). Hover the chip to see missing fields.', 'col-tax')}
      ${th('Kind', 'How evaluated: deterministic (rule), llm-judge (LLM scorer), agent (live run), human-review.', 'col-kind')}
      ${th('Severity', 'Failure impact: none → low → medium → high → critical. Use --zero-critical to block on critical.', 'col-sev')}
      ${th('Category', 'Machine-readable failure class set by your runner.\nExample: "hallucination", "tool-routing", "relevance".\nUseful for grouping failures in CI dashboards.')}
      ${th('Reason', 'Human-readable failure explanation from the runner or judge.\nExample: "The answer cited a non-existent policy.".\nShould be actionable enough to guide a fix.')}
    </tr></thead>
    <tbody>${rows.map((r) => {
    const tax = taxonomyCompleteness(r);
    return `<tr class="${r.passed ? '' : 'fail-row'}">
        <td><div class="row-name"><span class="row-name-label">${e(r.name ?? r.id)}</span>${r.name ? `<span class="row-name-id">${e(r.id)}</span>` : ''}</div></td>
        <td class="col-suite">${e(r.suite)}</td>
        <td style="text-align:center">${r.passed ? '<span style="color:var(--pass);font-weight:700">✓</span>' : '<span style="color:var(--fail);font-weight:700">✗</span>'}</td>
        <td class="col-tax taxonomy-score"><span class="score ${tax.score >= 0.8 ? 'complete' : tax.score >= 0.5 ? 'partial' : 'incomplete'}" data-tip="${tax.missing.length ? 'Missing fields:\n' + e(tax.missing.join('\n')) : 'All recommended fields present'}">${Math.round(tax.score * 100)}%</span></td>
        <td class="col-kind"><span class="kind-badge kind-${e(r.kind || 'unknown')}">${e(r.kind ?? 'unknown')}</span></td>
        <td class="col-sev"><span class="severity sev-${e(r.severity ?? 'none')}">${e(r.severity ?? 'none')}</span></td>
        <td>${e(r.category ?? '')}</td>
        <td class="col-reason reason">${e(r.reason ?? '')}</td>
      </tr>`;
  }).join('')}</tbody>
  </table></div>`;
};



const renderSparkline = (
  passRates: number[],
  width = 60,
  height = 24,
): string => {
  if (passRates.length === 0) return '';
  if (passRates.length === 1) {
    const rate = passRates[0];
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline"><line x1="5" y1="${height - rate * (height - 4) - 2}" x2="${width - 5}" y2="${height - rate * (height - 4) - 2}" stroke="currentColor" stroke-width="2" opacity="0.6" /></svg>`;
  }

  const points: [number, number][] = [];
  const minRate = Math.min(...passRates);
  const maxRate = Math.max(...passRates);
  const range = maxRate - minRate || 1;
  const pointSpacing = (width - 10) / (passRates.length - 1);

  for (let i = 0; i < passRates.length; i += 1) {
    const rate = passRates[i];
    const normalized = (rate - minRate) / range;
    const x = 5 + i * pointSpacing;
    const y = height - 2 - normalized * (height - 4);
    points.push([x, y]);
  }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline" style="display:inline-block;vertical-align:middle;margin:0 4px"><path d="${pathD}" stroke="currentColor" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke" /></svg>`;
};

const calculateTrend = (
  rates: number[],
): { direction: 'up' | 'down' | 'stable'; change: string } => {
  if (rates.length < 2) return { direction: 'stable', change: '—' };

  const old = rates[Math.max(0, rates.length - 6)]; // Compare to 5 runs ago or start
  const current = rates[rates.length - 1];
  const diff = current - old;
  const pctChange = old > 0 ? ((diff / old) * 100).toFixed(0) : '0';

  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (diff > 0.05) direction = 'up';
  else if (diff < -0.05) direction = 'down';

  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';
  return { direction, change: `${sign}${(diff * 100).toFixed(0)}%` };
};

const suiteRows = (suites: EvalSuiteSummary[]): string =>
  suites
    .map(
      (s) => `<tr>
        <td class="col-suite">${e(s.name ?? s.id)}</td>
        <td class="num">${s.total}</td>
        <td class="num pass">${s.passed}</td>
        <td class="num fail">${s.failed}</td>
        <td class="col-passrate">${pctBar(s.passed, s.total)} ${e(formatPassRate(s.passed, s.total))}</td>
      </tr>`,
    )
    .join('');

const suiteSummaryTable = (suites: EvalSuiteSummary[]): string =>
  `<div class="table-wrap"><table>
    <thead><tr>
      ${th('Suite', 'A named group of eval rows with a shared purpose.\nExample: "answer-quality" groups all LLM-judge rows; "tool-routing" groups agent behaviour checks.\nSet per-suite gate thresholds in your suite manifest.')}
      ${th('Total', 'Total rows evaluated in this suite this run.\nA drop from the last run means some cases were skipped or removed.', 'num')}
      ${th('Passed', 'Rows that met their pass threshold.\nFor llm-judge rows, this means score ≥ threshold. For deterministic, the assertion passed.', 'num')}
      ${th('Failed', 'Rows that did not meet their pass threshold.\nExpand the Failing Rows section to see per-case reasons and evidence.', 'num')}
      ${th('Pass rate', 'Passed ÷ Total for this suite.\nConfigure a per-suite minimum in your suite manifest: gate.minPassRate.\nExample: compliance suites often require 100%.', 'num')}
    </tr></thead>
    <tbody>${suiteRows(suites)}</tbody>
  </table></div>`;

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

const datasetChangelogTable = (entries: NonNullable<EvalReportV1['datasetChangelog']>): string => {
  if (!entries.length) return '<p class="empty">No dataset changelog entries.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Suite</th><th>Dataset</th><th>Rubric</th><th>Changed</th><th>Type</th><th>Rows</th><th>Summary</th></tr></thead>
    <tbody>${entries
      .map(
        (entry) => `<tr>
      <td>${e(entry.suiteName)}</td>
      <td>${e(entry.datasetVersion)}</td>
      <td>${e(entry.rubricVersion)}</td>
      <td>${e(entry.changedAt)}</td>
      <td>${e(entry.changeType)}</td>
      <td>${e(
          `+${entry.rowChanges.added} / ~${entry.rowChanges.updated} / -${entry.rowChanges.removed} / relabelled ${entry.rowChanges.relabelled}`,
        )}</td>
      <td class="reason">${e(entry.summary)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

type CollapsibleSectionOptions = {
  id: string;
  title: string;
  summary: string;
  body: string;
  rightControls?: string;
  collapsed?: boolean;
};

const renderCollapsibleSection = ({
  id,
  title,
  summary,
  body,
  rightControls,
  collapsed = true,
}: CollapsibleSectionOptions): string => {
  const isCollapsed = collapsed;
  return `<div class="section collapsible${isCollapsed ? ' collapsed' : ''}" data-section-id="${e(id)}">
      <div class="section-header">
        <div class="section-header-left">
          <button class="section-toggle" type="button" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-controls="section-body-${e(id)}" onclick="toggleSection(this)">
            <span class="section-toggle-icon" aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span>
            <span class="section-toggle-label">${e(title)}</span>
          </button>
          <span class="section-summary">${e(summary)}</span>
        </div>
        ${rightControls ?? ''}
      </div>
      <div id="section-body-${e(id)}" class="section-body">${body}</div>
    </div>`;
};

const renderHtml = (context: ReportContext): string => {
  const { locale, current, comparison, baselineCompatibility: compat } = context;
  const { run, rows } = current;
  const { newlyFailing, newlyPassing } = comparison;
  const datasetChangelog = current.datasetChangelog ?? [];
  const provenance = reportProvenance(current);
  const theme = resolveTheme(context.theme);
  const summary = summarizeReport(current);
  const failingRows = rows.filter((r) => !r.passed);
  const compatStatus = compat?.status ?? 'not compared';
  const compatClass = compatStatus === 'blocked' ? 'fail' : compatStatus === 'warning' ? 'warn' : 'pass';
  const passClass = summary.passRate >= 0.9 ? 'pass' : summary.passRate >= 0.6 ? 'warn' : 'fail';
  const totalDurationMs = rows
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
    .section-header { padding: 14px 18px; border-bottom: 1px solid var(--line); background: var(--surface-muted); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .section-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .section-toggle { border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; padding: 2px 0; }
    .section-toggle:hover { color: var(--ink); }
    .section-toggle-icon { display: inline-block; width: 10px; text-align: center; font-size: 12px; transform: translateY(-.5px); }
    .section-toggle-label { white-space: nowrap; }
    .section-summary { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section.collapsible.collapsed .section-body { display: none; }
    .section-body { padding: 0; }

    /* ── Tables ── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { padding: 10px 20px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--surface-muted); border-bottom: 1px solid var(--line); white-space: nowrap; border-right: 1px solid var(--line); }
    thead th:last-child { border-right: none; }
    tbody td { padding: 10px 20px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); vertical-align: middle; }
    tbody td:last-child { border-right: none; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--surface-muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .col-suite { white-space: nowrap; }
    .col-row { min-width: 160px; }
    .col-tax { min-width: 68px; text-align: center; white-space: nowrap; }
    .col-kind { white-space: nowrap; }
    .col-sev { white-space: nowrap; }
    .col-cat { white-space: nowrap; }
    .col-reason { width: 100%; }
    .col-passrate { white-space: nowrap; }
    .pass { color: var(--pass); font-weight: 700; }
    .fail { color: var(--fail); font-weight: 700; }
    .empty { padding: 16px 20px; color: var(--muted); font-style: italic; font-size: 13px; }

    /* ── Tooltips — floating div at body level, avoids overflow clipping ── */
    [data-tip] { cursor: help; }
    #eval-tooltip {
      position: fixed; z-index: 9999; pointer-events: none;
      background: var(--ink); color: var(--bg);
      font-size: 12px; font-weight: 400; font-style: normal;
      letter-spacing: 0; text-transform: none;
      white-space: pre-line; max-width: 260px;
      padding: 8px 12px; border-radius: 6px; line-height: 1.5;
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
      opacity: 0; transition: opacity .12s;
    }
    #eval-tooltip.visible { opacity: 1; }
    .th-tip { display: inline-flex; align-items: center; gap: 4px; }
    .info-icon { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center; border-radius: 50%; background: var(--muted); color: var(--bg); font-size: 9px; font-weight: 800; font-style: normal; flex-shrink: 0; opacity: .75; }
    .info-icon:hover { opacity: 1; }

    /* ── Row name + id cell ── */
    .row-name { display: flex; flex-direction: column; gap: 2px; }
    .row-name-label { font-weight: 600; }
    .row-name-id { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
    .bar-track { display: inline-block; width: 52px; height: 5px; border-radius: 3px; background: var(--line); vertical-align: middle; margin-right: 6px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--pass); }

    /* ── Severity chips ── */
    .severity { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .sev-none { background: var(--surface-muted); color: var(--muted); }
    .sev-low { background: var(--accent-soft); color: var(--accent); }
    .sev-medium { background: var(--warn-soft); color: var(--warn); }
    .sev-high, .sev-critical { background: var(--fail-soft); color: var(--fail); }

    /* ── Kind badges ── */
    .kind-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: var(--surface-muted); color: var(--muted); }
    .kind-deterministic { background: var(--accent-soft); color: var(--accent); }
    .kind-agent { background: var(--pass-soft); color: var(--pass); }
    .kind-llm-judge { background: var(--accent-soft); color: var(--accent); }
    .kind-human-review { background: var(--warn-soft); color: var(--warn); }

    /* ── Taxonomy completeness ── */
    .taxonomy-score { text-align: center; font-weight: 600; }
    .score { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; }
    .score.complete { background: var(--pass-soft); color: var(--pass); }
    .score.partial { background: var(--warn-soft); color: var(--warn); }
    .score.incomplete { background: var(--fail-soft); color: var(--fail); }

    /* ── Row grouping ── */
    .row-group { margin-bottom: 20px; }
    .group-header { padding: 12px 20px; background: var(--surface-muted); border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 12px; }
    .group-header h3 { font-size: 12px; font-weight: 700; color: var(--ink); }
    .group-label { font-size: 11px; color: var(--muted); }

    /* ── Expandable rows ── */
    tr.data-row { cursor: pointer; }
    tr.data-row:hover td { background: var(--surface-muted); }
    tr.data-row td:first-child { position: relative; padding-left: 36px; }
    .expand-toggle { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 3px; background: var(--line); color: var(--muted); font-size: 10px; font-weight: 700; transition: background .1s, transform .1s; flex-shrink: 0; line-height: 1; }
    tr.data-row.open .expand-toggle { background: var(--accent); color: var(--bg); }
    tr.detail-row { display: none; }
    tr.detail-row.open { display: table-row; }
    tr.detail-row > td { padding: 0; border-bottom: 1px solid var(--line); background: var(--surface); }
    .detail-panel { padding: 16px 20px 20px 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .detail-panel.single-col { grid-template-columns: 1fr; }
    .detail-field { display: flex; flex-direction: column; gap: 4px; }
    .detail-field-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .detail-field-value { font-size: 13px; color: var(--ink); word-break: break-word; }
    .detail-field-value.mono { font-family: var(--font-mono); font-size: 12px; background: var(--surface-muted); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--line); white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
    .detail-field.full-width { grid-column: 1 / -1; }
    .axis-scores { display: flex; flex-wrap: wrap; gap: 6px; }
    .axis-score-chip { font-family: var(--font-mono); font-size: 11px; background: var(--surface-muted); border: 1px solid var(--line); border-radius: 4px; padding: 2px 7px; }

    /* ── View switcher ── */
    .view-switcher { display: flex; gap: 4px; }
    .view-btn { padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; transition: background .1s, color .1s; }
    .view-btn:hover { background: var(--surface-muted); color: var(--ink); }
    .view-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .view-pane { display: none; }
    .view-pane.active { display: block; }
    .json-pane { padding: 16px 20px; }
    .json-pane pre { font-family: var(--font-mono); font-size: 12px; line-height: 1.6; background: var(--surface-muted); border: 1px solid var(--line); border-radius: 4px; padding: 12px 16px; overflow: auto; max-height: 600px; white-space: pre; }
    .compat-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .compat-pass { background: var(--pass-soft); color: var(--pass); }
    .compat-warn { background: var(--warn-soft); color: var(--warn); }
    .compat-fail { background: var(--fail-soft); color: var(--fail); }
    .provenance-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .provenance-deterministic { background: var(--accent-soft); color: var(--accent); }
    .provenance-legacy { background: var(--warn-soft); color: var(--warn); }
    .suite-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
    .suite-pill { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; padding: 4px 10px; font-size: 11px; font-weight: 700; border: 1px solid var(--line); }
    .suite-pill-pass { background: var(--pass-soft); color: var(--pass); border-color: var(--pass); }
    .suite-pill-fail { background: var(--fail-soft); color: var(--fail); border-color: var(--fail); }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; padding: 14px 16px; }
    .meta-card { border: 1px solid var(--line); border-radius: 8px; background: var(--surface-muted); padding: 10px 12px; }
    .meta-label { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 700; color: var(--ink); word-break: break-word; }
    .reference-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; padding: 14px 16px; }
    .reference-item { border: 1px solid var(--line); border-radius: 8px; background: var(--surface-muted); padding: 10px 12px; }
    .reference-item h3 { font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
    .reference-item p { font-size: 12px; color: var(--ink); }
    .muted { color: var(--muted); }

    .reason { font-family: var(--font-mono); font-size: 12px; word-break: break-word; color: var(--muted); }

    /* ── Sparklines ── */
    .sparkline { color: var(--accent); opacity: 0.8; }
    .trend-up { color: var(--pass); }
    .trend-down { color: var(--fail); }
    .trend-stable { color: var(--accent); }
    .history-row { display: flex; align-items: center; gap: 16px; padding: 12px 20px; border-bottom: 1px solid var(--line); }
    .history-row:last-child { border-bottom: none; }
    .history-row-label { flex: 1; font-size: 13px; font-weight: 600; }
    .history-row-trend { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
    .history-row-trend span { font-weight: 700; }

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
        <span>Provenance&nbsp;<strong><span class="provenance-badge provenance-${e(provenance.className)}">${e(provenance.label)}</span></strong></span>
        ${totalDurationMs > 0 ? `<span>Duration&nbsp;<strong>${e(formatDuration(totalDurationMs))}</strong></span>` : ''}
      </div>
    </div>
  </div>

  <div class="page">
    <div class="metrics">
      <div class="metric">
        <div class="metric-label" data-tip="Percentage of eval rows that passed this run.\nExample: 66.7% means 2 of 3 rows passed.\nSet a minimum in CI with --min-pass-rate=0.9">Pass rate</div>
        <div class="metric-value ${passClass}">${e(formatPassRate(summary.passed, summary.total))}</div>
      </div>
      <div class="metric">
        <div class="metric-label" data-tip="Rows that met their pass threshold this run.\nExample: 2/3 means one case still fails.\nIncludes both unchanged passes and newly recovered ones.">Passed</div>
        <div class="metric-value">${summary.passed}<span style="font-size:16px;font-weight:400;color:var(--muted)">/${summary.total}</span></div>
      </div>
      <div class="metric">
        <div class="metric-label" data-tip="Regressions: rows that passed last run but fail now.\nExample: your prompt change broke the conciseness check.\nGate with --max-new-failures=0 to block merges on any regression.">New failures</div>
        <div class="metric-value ${newlyFailing.length > 0 ? 'fail' : 'pass'}">${newlyFailing.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label" data-tip="Recoveries: rows that failed last run but pass now.\nExample: your prompt fix resolved the verbosity failure.\nPositive signal — track over time to confirm the fix holds.">New passes</div>
        <div class="metric-value ${newlyPassing.length > 0 ? 'pass' : ''}">${newlyPassing.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label" data-tip="Are trend comparisons meaningful?\n• compatible — same dataset + rubric versions, safe to diff\n• warning — dataset or rubric version changed; treat trends as approximate\n• blocked — breaking version mismatch; new/lost failures may be noise, not signal\nExample: bumping datasetVersion from v1 to v2 triggers a warning.">Baseline</div>
        <div class="metric-value" style="font-size:15px;padding-top:5px">
          <span class="compat-badge compat-${compatClass}">${e(compatStatus)}</span>
        </div>
      </div>
    </div>

    ${summary.suites.length > 0
      ? `<div class="suite-strip">${summary.suites
        .map((suite) => {
          const passRate = suite.total > 0 ? suite.passed / suite.total : 0;
          const pillClass = suite.failed > 0 ? 'suite-pill-fail' : 'suite-pill-pass';
          const suiteLabel = suite.name ?? suite.id;
          const passPct = (passRate * 100).toFixed(1);
          const tip = `${suiteLabel}\nPass rate: ${passPct}%\nPassed: ${suite.passed}/${suite.total}\nFailed: ${suite.failed}`;
          return `<span class="suite-pill ${pillClass}" data-tip="${e(tip)}">${e(suiteLabel)} ${e(passPct)}%</span>`;
        })
        .join('')}</div>`
      : ''
    }

    ${renderCollapsibleSection({
      id: 'run-metadata',
      title: 'Run metadata',
      summary: [run.branch, run.commit, run.buildId].filter(Boolean).join(' • ') || 'Run identity and provenance details',
      body: metadataCards(run, totalDurationMs),
    })}

    ${renderCollapsibleSection({
      id: 'gate-policy',
      title: 'Gate policy',
      summary: pluralize(current.suiteManifests?.length ?? 0, 'suite manifest'),
      body: gatePolicyTable(current),
    })}

    ${context.history.length > 1
      ? (() => {
        const passRates = context.history.map((h) => h.passRate);
        const { direction, change } = calculateTrend(passRates);
        return renderCollapsibleSection({
          id: 'pass-rate-trend',
          title: 'Pass-rate trend',
          summary: `${formatPassRate(summary.passed, summary.total)} current`,
          body: `
        <div class="history-row">
          <div class="history-row-label">Overall pass rate</div>
          <div class="history-row-trend trend-${direction}">
            ${renderSparkline(passRates)}
            <span>${change}</span>
          </div>
        </div>
      `,
        });
      })()
      : ''
    }

    ${renderCollapsibleSection({
      id: 'suite-summary',
      title: 'Suite summary',
      summary: pluralize(current.suites.length, 'suite'),
      body: suiteSummaryTable(current.suites),
    })}

    ${datasetChangelog.length
      ? renderCollapsibleSection({
        id: 'dataset-changelog',
        title: 'Dataset changelog',
        summary: pluralize(datasetChangelog.length, 'entry'),
        body: datasetChangelogTable(datasetChangelog),
      })
      : ''
    }

    ${renderCollapsibleSection({
      id: 'failing-rows',
      title: 'Failing rows',
      summary: pluralize(failingRows.length, 'row'),
      rightControls: `<div style="display:flex;align-items:center;gap:12px">
          ${failingRows.length > 0 ? `<div class="view-switcher">
            <button class="view-btn active" onclick="switchView('failrows','details',this)">Details</button>
            <button class="view-btn" onclick="switchView('failrows','table',this)">Table</button>
            <button class="view-btn" onclick="switchView('failrows','json',this)">JSON</button>
          </div>` : ''}
        </div>`,
      body: `${failingRows.length > 0
        ? `<div id="failrows-details" class="view-pane active">${groupedRowsTable(failingRows, true)}</div>
             <div id="failrows-table" class="view-pane">${flatRowsTable(failingRows)}</div>
             <div id="failrows-json" class="view-pane json-pane"><pre>${e(JSON.stringify(failingRows, null, 2))}</pre></div>`
        : '<p class="empty">No failing rows.</p>'
        }`,
    })}

    ${renderCollapsibleSection({
      id: 'all-rows',
      title: 'All rows',
      summary: pluralize(current.rows.length, 'row'),
      rightControls: `<div style="display:flex;align-items:center;gap:12px">
          <div class="view-switcher">
            <button class="view-btn active" onclick="switchView('allrows','details',this)">Details</button>
            <button class="view-btn" onclick="switchView('allrows','table',this)">Table</button>
            <button class="view-btn" onclick="switchView('allrows','json',this)">JSON</button>
          </div>
        </div>`,
      body: `<div id="allrows-details" class="view-pane active">${groupedRowsTable(current.rows, true)}</div>
        <div id="allrows-table" class="view-pane">${flatRowsTable(current.rows)}</div>
        <div id="allrows-json" class="view-pane json-pane"><pre>${e(JSON.stringify(current, null, 2))}</pre></div>`,
    })}

    ${compat?.issues.length
      ? renderCollapsibleSection({
        id: 'baseline-compatibility',
        title: 'Baseline compatibility',
        summary: pluralize(compat.issues.length, 'issue'),
        body: `<div class="table-wrap"><table>
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
      </table></div>`,
      })
      : ''
    }

    ${renderCollapsibleSection({
      id: 'how-to-read',
      title: 'How to read this report',
      summary: 'Reference guide for interpreting scores, gates, and trend shifts',
      body: renderHowToRead(),
    })}

    <footer>
      Generated by <a href="https://github.com/icodenet/eval-dashboards" target="_blank" rel="noopener">@icodenet/eval-dashboards</a>
    </footer>
  </div>

  <div id="eval-tooltip" role="tooltip"></div>

  <script>
    function toggleSection(btn) {
      var section = btn.closest('.section.collapsible');
      if (!section) return;
      var isCollapsed = section.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      var icon = btn.querySelector('.section-toggle-icon');
      if (icon) icon.textContent = isCollapsed ? '▸' : '▾';
    }
    function toggleRow(tr) {
      var isOpen = tr.classList.contains('open');
      tr.classList.toggle('open', !isOpen);
      var detail = tr.nextElementSibling;
      if (detail && detail.classList.contains('detail-row')) {
        detail.classList.toggle('open', !isOpen);
      }
    }
    function switchView(section, view, btn) {
      var panes = document.querySelectorAll('[id^="' + section + '-"]');
      panes.forEach(function(p) { p.classList.remove('active'); });
      document.getElementById(section + '-' + view).classList.add('active');
      var btns = btn.parentElement.querySelectorAll('.view-btn');
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    (function () {
      var tip = document.getElementById('eval-tooltip');
      var hide = function () { tip.classList.remove('visible'); };
      document.addEventListener('mouseover', function (e) {
        var el = e.target.closest('[data-tip]');
        if (!el) { hide(); return; }
        tip.textContent = el.getAttribute('data-tip');
        tip.classList.add('visible');
        position(e);
      });
      document.addEventListener('mousemove', function (e) {
        if (tip.classList.contains('visible')) position(e);
      });
      document.addEventListener('mouseout', function (e) {
        if (!e.relatedTarget || !e.relatedTarget.closest('[data-tip]')) hide();
      });
      function position(e) {
        var pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
        var x = e.clientX + pad;
        var y = e.clientY - h - pad;
        if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
        if (y < 8) y = e.clientY + pad;
        tip.style.left = x + 'px';
        tip.style.top  = y + 'px';
      }
    })();
  </script>
</body>
</html>`;
};