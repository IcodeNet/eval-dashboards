import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { renderGroupedIndexHtml, renderReports } from '../src/reporters/render.js';
import type { ReporterName } from '../src/reporters/render.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-reports-render-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('render html safety and taxonomy scoring', () => {
  it('redacts forbidden organization tokens from rendered HTML output', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-1',
        generatedAt: '2026-08-03T12:00:00.000Z',
        project: 'flagstone internal project',
      },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: false,
          severity: 'high',
          category: 'policy',
          reason: 'Contains flagstone-only reference in output.',
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html.toLowerCase()).not.toContain('flagstone');
    expect(html).toContain('[redacted]');
  });

  it('echoes top-level tags (4F.15) in html and markdown reports', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-tags',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
      tags: { pr: '42', model: 'gpt-4o' },
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html', 'markdown-summary', 'json-summary'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('pr=42');
    expect(html).toContain('model=gpt-4o');

    const markdown = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(markdown).toContain('pr=42');
    expect(markdown).toContain('model=gpt-4o');
  });

  it('renders declared suite scoreScale (4F.18) on row score bars, falling back to 0-1 when absent', async () => {
    const reportDir = await createTempDir();
    const scaled: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-scale', generatedAt: '2026-08-04T12:00:00.000Z' },
      suites: [{ id: 'likert', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'likert',
          target: 'judge',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          rubricVersion: 'v1',
          gate: { mode: 'report-only', thresholds: {} },
          scoreScale: { min: 0, max: 3 },
        },
      ],
      rows: [
        { id: 'row-1', suite: 'likert', passed: true, score: 2, reason: 'Likert score 2 of 3' },
      ],
    };

    await renderReports(
      {
        current: scaled,
        previous: undefined,
        history: [],
        comparison: compareRuns(scaled, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('2 (of 0-3)');
  });

  it('groups by compliance-framework tags (4F.14) when present, with no UI change when absent', async () => {
    const reportDir = await createTempDir();
    const tagged: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-compliance', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'pii', total: 2, passed: 1, failed: 1 }],
      suiteManifests: [
        {
          name: 'pii',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'pii',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: {} },
          complianceFrameworks: ['eu:ai-act'],
        },
      ],
      rows: [
        { id: 'row-1', suite: 'pii', passed: true, complianceRefs: ['owasp:llm:01'] },
        { id: 'row-2', suite: 'pii', passed: false, complianceRefs: ['nist:ai:measure:1.1'] },
      ],
    };

    await renderReports(
      {
        current: tagged,
        previous: undefined,
        history: [],
        comparison: compareRuns(tagged, undefined),
        reportDir,
      },
      ['html', 'markdown-summary'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('owasp:llm:01');
    expect(html).toContain('nist:ai:measure:1.1');
    expect(html).toContain('eu:ai-act');

    const markdown = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(markdown).toContain('Compliance coverage');
    expect(markdown).toContain('owasp:llm:01');
    expect(markdown).toContain('eu:ai-act');

    // Absent case: no compliance tags anywhere -> no compliance section rendered.
    const untaggedReportDir = await createTempDir();
    const untagged: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-no-compliance', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    };

    await renderReports(
      {
        current: untagged,
        previous: undefined,
        history: [],
        comparison: compareRuns(untagged, undefined),
        reportDir: untaggedReportDir,
      },
      ['html', 'markdown-summary'],
    );

    const untaggedHtml = await readFile(path.join(untaggedReportDir, 'index.html'), 'utf8');
    expect(untaggedHtml).not.toContain('compliance-coverage');

    const untaggedMarkdown = await readFile(path.join(untaggedReportDir, 'summary.md'), 'utf8');
    expect(untaggedMarkdown).not.toContain('Compliance coverage');
  });

  it('does not mark judgeVerdict as missing when it is false', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-2',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-2',
          suite: 'quality',
          kind: 'llm-judge',
          passed: true,
          severity: 'none',
          category: 'quality',
          datasetId: 'dataset-v1',
          scenarioId: 'scenario-v1',
          rubricId: 'rubric-v1',
          judgeVerdict: false,
          axisScores: { helpfulness: 1 },
          axisReasoning: { helpfulness: 'Directly answered the user question <script>evil()</script>' },
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('All recommended fields present');
    expect(html).not.toContain('Missing fields:\njudgeVerdict');
    expect(html).toContain('axis-score-reasoning');
    expect(html).toContain('Directly answered the user question &lt;script&gt;evil()&lt;/script&gt;');
    expect(html).not.toContain('<script>evil()</script>');
  });

  it('renders dataset changelog section when entries are provided', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-3',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-3', suite: 'quality', passed: true }],
      datasetChangelog: [
        {
          suiteName: 'quality',
          datasetVersion: '1.1.0',
          rubricVersion: '1.0.0',
          changedAt: '2026-08-03',
          changeType: 'minor',
          summary: 'Added new evaluation rows for coverage.',
          rowChanges: { added: 3, updated: 0, removed: 0, relabelled: 0 },
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Dataset changelog');
    expect(html).toContain('Added new evaluation rows for coverage.');
  });

  it('renders judge calibration summary when labelled verdict rows are present', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-calibration',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'judge-calibration', total: 3, passed: 2, failed: 1 }],
      rows: [
        {
          id: 'case-1',
          suite: 'judge-calibration',
          passed: true,
          kind: 'llm-judge',
          severity: 'none',
          category: 'judge-calibration',
          judgeVerdict: true,
          groundTruthVerdict: true,
        },
        {
          id: 'case-2',
          suite: 'judge-calibration',
          passed: false,
          kind: 'llm-judge',
          severity: 'high',
          category: 'judge-calibration',
          judgeVerdict: false,
          groundTruthVerdict: true,
        },
        {
          id: 'case-3',
          suite: 'judge-calibration',
          passed: true,
          kind: 'llm-judge',
          severity: 'none',
          category: 'judge-calibration',
          judgeVerdict: false,
          groundTruthVerdict: false,
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Judge calibration');
    expect(html).toContain('3 labelled rows');
    expect(html).toContain('66.7% agreement');
    expect(html).toContain('1 disagreement');
    expect(html).toContain('Agreement pairs');
  });

  it('renders provenance badge and suite pass-rate pills', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-4',
        generatedAt: '2026-08-03T12:00:00.000Z',
        branch: 'refs/heads/main',
        commit: 'abc1234',
        buildId: '255446',
      },
      suites: [
        { id: 'quality', total: 2, passed: 2, failed: 0 },
        { id: 'safety', total: 2, passed: 1, failed: 1 },
      ],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
        {
          name: 'safety',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'compliance',
          graders: ['deterministic-assertions'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [
        { id: 'q1', suite: 'quality', passed: true },
        { id: 'q2', suite: 'quality', passed: true },
        { id: 's1', suite: 'safety', passed: true },
        { id: 's2', suite: 'safety', passed: false, reason: 'policy mismatch' },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Provenance');
    expect(html).toContain('manifest hash');
    expect(html).toContain('quality 100.0%');
    expect(html).toContain('safety 50.0%');
    expect(html).toContain('class="suite-pill suite-pill-pass" data-tip="quality');
    expect(html).toContain('class="suite-pill suite-pill-fail" data-tip="safety');
    expect(html).toContain('class="metric" data-tip="Rows that met their pass threshold this run.');
  });

  it('renders sections collapsed by default with summary and toggle affordance', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-collapsed',
        generatedAt: '2026-08-03T12:00:00.000Z',
        branch: 'refs/heads/main',
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-collapsed', suite: 'quality', passed: true }],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('class="section collapsible collapsed" data-section-id="suite-summary"');
    expect(html).toContain('class="section collapsible" data-section-id="pass-rate-trend"');
    expect(html).toContain('class="section-toggle-icon" aria-hidden="true">▸</span>');
    expect(html).toContain('class="section-summary section-summary-pass">1 suite • 1/1 passed (100.0%)</span>');
    expect(html).toContain('Need at least 2 runs to show direction');
    expect(html).toContain('onclick="toggleSection(this)"');
  });

  it('renders markdown diff sections for row flips', async () => {
    const reportDir = await createTempDir();
    const previous: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-prev', generatedAt: '2026-08-03T11:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
      rows: [
        { id: 'r1', suite: 'quality', passed: true, category: 'clarity', reason: 'ok' },
        { id: 'r2', suite: 'quality', passed: false, category: 'safety', reason: 'failed before' },
      ],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
    };
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-current',
        generatedAt: '2026-08-03T12:00:00.000Z',
        branch: 'refs/heads/main',
        commit: 'cfe409c',
        buildId: '255446',
      },
      suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
      rows: [
        { id: 'r1', suite: 'quality', passed: false, category: 'clarity', reason: 'regressed' },
        { id: 'r2', suite: 'quality', passed: true, category: 'safety', reason: 'fixed now' },
      ],
      suiteManifests: previous.suiteManifests,
    };

    await renderReports(
      {
        current,
        previous,
        history: [],
        comparison: compareRuns(current, previous),
        reportDir,
      },
      ['markdown-summary'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('## Newly failing (1)');
    expect(md).toContain('quality/r1: clarity');
    expect(md).toContain('## Newly passing (1)');
    expect(md).toContain('quality/r2: safety');
    expect(md).toContain('| Branch | refs/heads/main |');
    expect(md).toContain('| Build | 255446 |');
  });

  it('renders latency distribution stats when rows include durationMs', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-latency',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 4, passed: 4, failed: 0 }],
      rows: [
        { id: 'r1', suite: 'quality', passed: true, durationMs: 100 },
        { id: 'r2', suite: 'quality', passed: true, durationMs: 200 },
        { id: 'r3', suite: 'quality', passed: true, durationMs: 400 },
        { id: 'r4', suite: 'quality', passed: true, durationMs: 1000 },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary', 'html'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('| Rows with duration | 4/4 |');
    expect(md).toContain('| Latency p50 | 200ms |');
    expect(md).toContain('| Latency p95 | 1.0s |');
    expect(md).toContain('| Average row latency | 425ms |');
    expect(md).toContain('| Max row latency | 1.0s |');

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Rows with duration');
    expect(html).toContain('4/4');
    expect(html).toContain('Latency p50');
    expect(html).toContain('Latency p95');
  });

  it('renders first-class usage metrics (tokens/cost) totals and row detail', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-usage',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
      rows: [
        {
          id: 'r1',
          suite: 'quality',
          passed: true,
          durationMs: 100,
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, costUsd: 0.01, model: 'gpt-4o' },
        },
        {
          id: 'r2',
          suite: 'quality',
          passed: true,
          durationMs: 200,
          usage: { totalTokens: 80, costUsd: 0.02 },
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary', 'html'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('| Total cost | $0.0300 |');
    expect(md).toContain('| Total tokens | 200 |');

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Total cost');
    expect(html).toContain('$0.0300');
    expect(html).toContain('Total tokens');
    expect(html).toContain('Usage model');
    expect(html).toContain('gpt-4o');
  });

  it('renders cost/latency-quality frontier sections when row metrics are present', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-frontier',
        generatedAt: '2026-08-03T12:00:00.000Z',
        branch: 'main',
        commit: 'abc123',
      },
      suites: [{ id: 'quality', total: 5, passed: 5, failed: 0 }],
      rows: [
        { id: 'r1', name: 'fast-good', suite: 'quality', passed: true, score: 0.88, durationMs: 120, metadata: { costUsd: 0.032 } },
        { id: 'r2', name: 'slower-better', suite: 'quality', passed: true, score: 0.93, durationMs: 240, metadata: { costUsd: 0.061 } },
        { id: 'r3', name: 'slow-mid', suite: 'quality', passed: true, score: 0.87, durationMs: 320, metadata: { costUsd: 0.07 } },
        { id: 'r4', name: 'fast-low-cost', suite: 'quality', passed: true, score: 0.84, durationMs: 100, metadata: { cost: { usd: 0.028 } } },
        { id: 'r5', name: 'unscored-pass', suite: 'quality', passed: true, durationMs: 80, metadata: { costUsd: 0.01 } },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary', 'html'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('| Branch | main |');
    expect(md).toContain('| Commit | abc123 |');
    expect(md).toContain('## Cost/latency-quality frontier');
    expect(md).toContain('### Latency-quality frontier');
    expect(md).toContain('### Cost-quality frontier');
    expect(md).toContain('| fast-low-cost | quality | 0.840 | 100ms |');
    expect(md).toContain('| fast-low-cost | quality | 0.840 | 0.0280 |');
    expect(md).not.toContain('slow-mid');
    expect(md).not.toContain('unscored-pass');

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Cost/latency-quality frontier');
    expect(html).toContain('Latency-quality Pareto frontier');
    expect(html).toContain('Cost-quality Pareto frontier');
    expect(html).toContain('fast-low-cost');
  });

  it('omits frontier sections when rows do not include frontier metrics', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-no-frontier', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
      rows: [
        { id: 'r1', suite: 'quality', passed: true },
        { id: 'r2', suite: 'quality', passed: false },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary', 'html'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).not.toContain('Cost/latency-quality frontier');

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).not.toContain('cost-latency-frontier');
  });

  it('escapes markdown frontier table cells and falls back when primary cost alias is negative', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-frontier-escaped', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
      rows: [
        { id: 'r1', name: 'a|b', suite: 'suite|name', passed: true, score: 0.95, durationMs: 100, metadata: { costUsd: 0.02 } },
        { id: 'r2', name: 'negative-primary-cost', suite: 'quality', passed: true, score: 0.9, durationMs: 110, metadata: { costUsd: -0.2, cost: { usd: 0.01 } } },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('| a\\|b | suite\\|name | 0.950 | 100ms |');
    expect(md).toContain('| negative-primary-cost | quality | 0.900 | 0.0100 |');
  });

  it('excludes rows with null score or null duration from frontier calculations', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-frontier-null-filter', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'q', total: 3, passed: 3, failed: 0 }],
      rows: [
        { id: 'good', name: 'good-row', suite: 'q', passed: true, score: 0.9, durationMs: 200, metadata: { costUsd: 0.03 } },
        { id: 'null-score', name: 'null-score', suite: 'q', passed: true, score: null as unknown as number, durationMs: 50, metadata: { costUsd: 0.01 } },
        { id: 'null-duration', name: 'null-duration', suite: 'q', passed: true, score: 0.99, durationMs: null as unknown as number, metadata: { costUsd: 0.05 } },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['markdown-summary'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('## Cost/latency-quality frontier');
    expect(md).toContain('| good-row | q | 0.900 | 200ms |');
    expect(md).not.toContain('null-score');
    expect(md).toContain('| null-duration | q | 0.990 | 0.0500 |');
    expect(md).not.toContain('| null-duration | q | 0.990 | 0ms |');
    expect(md).not.toContain('| 0ms |');
  });

  it('renders statistical confidence context in markdown and html when bootstrap mode is enabled', async () => {
    const reportDir = await createTempDir();
    const previous: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-stat-prev', generatedAt: '2026-08-03T11:00:00.000Z' },
      suites: [{ id: 'quality', total: 4, passed: 2, failed: 2 }],
      rows: [
        { id: 'p1', suite: 'quality', passed: true },
        { id: 'p2', suite: 'quality', passed: true },
        { id: 'p3', suite: 'quality', passed: false },
        { id: 'p4', suite: 'quality', passed: false },
      ],
    };
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-stat-current', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 4, passed: 3, failed: 1 }],
      rows: [
        { id: 'c1', suite: 'quality', passed: true },
        { id: 'c2', suite: 'quality', passed: true },
        { id: 'c3', suite: 'quality', passed: true },
        { id: 'c4', suite: 'quality', passed: false },
      ],
    };

    await renderReports(
      {
        current,
        previous,
        history: [],
        comparison: compareRuns(current, previous),
        reportDir,
        statistical: {
          mode: 'bootstrap',
          confidenceLevel: 0.9,
          bootstrapSamples: 400,
          minPassRateDelta: 0,
        },
      },
      ['markdown-summary', 'html'],
    );

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('| Statistical context | bootstrap CI (90%, n=400)');
    expect(md).toContain('required min Δ=0.000');

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Statistical context');
    expect(html).toContain('bootstrap CI (90%, n=400)');
  });

  it('renders gate policy source links and report reference section', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-5',
        generatedAt: '2026-08-03T12:00:00.000Z',
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetPath: 'examples/taxonomy-complete-fixture/run-complete.json',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
      rubricContracts: [
        {
          suiteName: 'quality',
          rubricVersion: '1.0.0',
          rubrics: [
            {
              axis: 'clarity',
              version: '1.0.0',
              sourcePath: 'docs/taxonomy.md',
            },
          ],
        },
      ],
      rows: [{ id: 'r1', suite: 'quality', passed: true }],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Gate policy');
    expect(html).toContain('../examples/taxonomy-complete-fixture/run-complete.json');
    expect(html).toContain('../docs/taxonomy.md');
    expect(html).toContain('How to read this report');
    expect(html).toContain('Run metadata');
  });

  it('renders trace reference links in HTML and markdown summaries when present', async () => {
    const reportDir = await createTempDir();
    const previous: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-prev-trace', generatedAt: '2026-08-03T11:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'trace-row', suite: 'quality', passed: true, category: 'routing' }],
    };
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-trace', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      rows: [
        {
          id: 'trace-row',
          suite: 'quality',
          passed: false,
          category: 'routing',
          reason: 'Used wrong tool',
          trace: {
            traceId: 'trace-123',
            spanId: 'span-456',
            traceUrl: 'https://traces.example/runs/trace-123',
            spanUrl: 'https://traces.example/runs/trace-123/spans/span-456',
            spanType: 'tool',
          },
        },
      ],
    };

    await renderReports(
      {
        current,
        previous,
        history: [],
        comparison: compareRuns(current, previous),
        reportDir,
      },
      ['html', 'markdown-summary'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('<a href="https://traces.example/runs/trace-123" target="_blank" rel="noopener">trace</a>');
    expect(html).toContain('<a href="https://traces.example/runs/trace-123/spans/span-456" target="_blank" rel="noopener">span</a>');
    expect(html).toContain('Trace ID');
    expect(html).toContain('trace-123');
    expect(html).toContain('Span type');
    expect(html).toContain('span-type-tag">tool</span>');

    const md = await readFile(path.join(reportDir, 'summary.md'), 'utf8');
    expect(md).toContain('[trace](https://traces.example/runs/trace-123)');
    expect(md).toContain('[span](https://traces.example/runs/trace-123/spans/span-456)');
    expect(md).toContain('(tool)');
  });

  it('omits Trace column from failing rows table when no trace links are present', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-no-trace-links', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: false, reason: 'failed assertion' }],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).not.toContain('<th>Trace</th>');
    expect(html).not.toContain('<span class="muted">n/a</span>');
  });

  it('renders guardrail triage section for attack-style failing suites', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-guardrail', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'refusal-safety', total: 2, passed: 0, failed: 2 }],
      suiteManifests: [
        {
          name: 'refusal-safety',
          target: 'agent',
          datasetSource: 'manual',
          datasetVersion: 'v1',
          rubricVersion: 'r1',
          riskArea: 'content-safety',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 1 } },
        },
      ],
      rows: [
        {
          id: 'gr-1',
          suite: 'refusal-safety',
          passed: false,
          severity: 'high',
          category: 'prompt-injection',
          reason: 'Accepted jailbreak payload',
        },
        {
          id: 'gr-2',
          suite: 'refusal-safety',
          passed: false,
          severity: 'critical',
          category: 'sensitive-disclosure',
          reason: 'Leaked token-like secret',
        },
      ],
    };

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
        profile: 'guardrail',
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain('Guardrail triage');
    expect(html).toContain('risk areas: content-safety');
    expect(html).toContain('prompt-injection');
    expect(html).toContain('sensitive-disclosure');
  });

  it('renders grouped multi-report index by target', () => {
    const reports: EvalReportV1[] = [
      {
        schemaVersion: 'eval-report/v1',
        run: { id: 'agent-run', generatedAt: '2026-08-03T12:00:00.000Z', kind: 'agent' },
        suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
        rows: [
          { id: 'a1', suite: 'quality', passed: true },
          { id: 'a2', suite: 'quality', passed: false },
        ],
      },
      {
        schemaVersion: 'eval-report/v1',
        run: { id: 'judge-run', generatedAt: '2026-08-03T12:01:00.000Z', kind: 'judge' },
        suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
        rows: [{ id: 'j1', suite: 'quality', passed: true }],
      },
    ];

    const html = renderGroupedIndexHtml(reports, 'en-GB');
    expect(html).toContain('Eval report index');
    expect(html).toContain('agent (1 report)');
    expect(html).toContain('judge (1 report)');
    expect(html).toContain('agent-run');
    expect(html).toContain('judge-run');
  });

  it('throws for unknown reporter names instead of silently skipping', async () => {
    const reportDir = await createTempDir();
    const current: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-unknown-reporter', generatedAt: '2026-08-03T12:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    };

    await expect(
      renderReports(
        {
          current,
          previous: undefined,
          history: [],
          comparison: compareRuns(current, undefined),
          reportDir,
        },
        ['bogus' as unknown as ReporterName],
      ),
    ).rejects.toThrow('Unknown reporter bogus');
  });
});
