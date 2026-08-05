import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { renderGroupedIndexHtml, renderReports } from '../src/reporters/render.js';

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
});
