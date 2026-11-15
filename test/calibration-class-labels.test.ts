import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRun, createEvalReportArtifact, checkGates, compareRuns, evaluateReportPolicy, exportUnresolvedRowsBundle,
  mergeAdjudicationBundle, lintReportTaxonomy, renderReports, validateEvalReport, type EvalReportV1 } from '../src/index.js';

const labels = ['fully answered', 'partially answered', 'not covered', 'wrong'];
const fixture = (): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'class-review', generatedAt: '2026-11-15T12:00:00Z', kind: 'calibration' },
  suites: [{ id: 'judge-calibration', total: 4, passed: 3, failed: 1 }],
  suiteManifests: [{ name: 'judge-calibration', target: 'judge', datasetSource: 'synthetic', datasetVersion: '1',
    rubricVersion: '1', riskArea: 'response-quality', graders: ['human-labelled-calibration'],
    labelScale: { labels: [...labels], passLabels: [labels[0]] },
    gate: { mode: 'blocking', thresholds: { minJudgeKappa: 0.6, minCalibrationRows: 4 } } }],
  rows: labels.map((label, i) => ({ id: `answer-${i}`, suite: 'judge-calibration', passed: i !== 1,
    kind: 'llm-judge', judgeModel: 'judge-a', judgeLabel: i === 1 ? labels[0] : label, groundTruthLabel: label,
    judgeVerdict: i < 2, groundTruthVerdict: i === 0 })),
} as EvalReportV1);

const classSummary = (input: EvalReportV1) => analyzeRun(input).calibration.classSummaries![0];

describe('declared multi-class calibration', () => {
  it('measures the actual four classes rather than their Pass/Fail mapping', () => {
    const input = fixture();
    expect(validateEvalReport(input).ok).toBe(true);
    const result = classSummary(input);
    expect(result.total).toBe(4); expect(result.agreements).toBe(3);
    expect(result.agreementRate).toBe(0.75); expect(result.kappa).toBeCloseTo(2 / 3);
    expect(result.labelCounts.map(count => count.label)).toEqual(labels);
    expect(result.labelCounts[1]).toMatchObject({ human: 1, judge: 0, matches: 0 });
    expect(analyzeRun(input).calibration.kappa).toBeCloseTo(0.5);
  });
  it('uses class agreement for declared suite gates and exact kappa bounds', () => {
    const input = fixture();
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(true);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.6666666666666667;
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(false);
  });
  it('does not borrow boolean verdicts when a class label is missing', () => {
    const input = fixture() as EvalReportV1 & { rows: Array<{ groundTruthLabel?: string }> };
    delete input.rows[0].groundTruthLabel;
    expect(checkGates(input, compareRuns(input), {}).failures.join(' ')).toContain('verdict pairs 3');
  });
  it.each([
    ['duplicate labels', { labels: ['full', 'full'], passLabels: ['full'] }],
    ['missing pass mapping', { labels: ['full', 'wrong'] }],
    ['unknown pass label', { labels: ['full', 'wrong'], passLabels: ['other'] }],
    ['empty class', { labels: ['full', ''], passLabels: ['full'] }],
  ])('rejects %s', (_name, scale) => {
    const input = fixture() as unknown as { suiteManifests: Array<{ labelScale: unknown }> };
    input.suiteManifests[0].labelScale = scale;
    expect(validateEvalReport(input).ok).toBe(false);
  });
  it('rejects unknown labels and contradictory optional booleans', () => {
    const input = fixture() as EvalReportV1 & { rows: Array<{ judgeLabel: string }> };
    input.rows[0].judgeLabel = 'other'; expect(validateEvalReport(input).ok).toBe(false);
    input.rows[0].judgeLabel = labels[0]; input.rows[0].judgeVerdict = false;
    expect(validateEvalReport(input).ok).toBe(false);
  });
  it('requires a declared scale for class labels', () => {
    const input = fixture() as EvalReportV1 & { suiteManifests: Array<{ labelScale?: unknown }> };
    delete input.suiteManifests[0].labelScale;
    expect(validateEvalReport(input).ok).toBe(false);
  });
  it('uses matching class-labelled evidence for blocking judge preflight', () => {
    const calibration = fixture();
    const current: EvalReportV1 = { ...calibration, run: { id: 'production', generatedAt: '2026-11-15T13:00:00Z' },
      suites: [{ id: 'answers', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'answer', suite: 'answers', passed: true, judgeModel: 'judge-a' }],
      suiteManifests: [{ ...calibration.suiteManifests![0], name: 'answers', target: 'agent', graders: ['llm-judge'],
        gate: { mode: 'blocking', thresholds: {} } }] };
    const options = { current, reports: [calibration], gateConfig: { calibration: { enabled: true } } };
    expect(evaluateReportPolicy(options).gatePassed).toBe(true);
    calibration.rows[0].judgeModel = 'other-judge';
    expect(evaluateReportPolicy(options).gatePassed).toBe(false);
  });
  it('accepts class-only rows and keeps missing or single-class kappa unavailable', () => {
    const input = fixture();
    for (const row of input.rows) { delete row.judgeVerdict; delete row.groundTruthVerdict; }
    expect(validateEvalReport(input).ok).toBe(true);
    expect(classSummary(input).kappa).toBeCloseTo(2 / 3);
    input.rows.forEach(row => { row.judgeLabel = labels[0]; row.groundTruthLabel = labels[0]; });
    expect(classSummary(input)).toMatchObject({ total: 4, kappaStatus: 'degenerate' });
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(false);
    input.rows.forEach(row => { delete row.judgeLabel; });
    expect(classSummary(input)).toMatchObject({ total: 0, kappaStatus: 'no-pairs' });
  });
  it('resolves a suite display-name alias without mixing another suite', () => {
    const input = fixture();
    input.suites[0].name = 'Judge review'; input.suiteManifests![0].name = 'Judge review';
    input.rows[0].suite = 'Judge review';
    expect(validateEvalReport(input).ok).toBe(true);
    expect(classSummary(input).total).toBe(4);
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(true);
  });
  it('separates scales and missing judge/category names in class breakdowns', () => {
    const input = fixture(); input.rows[0].judgeModel = undefined;
    const groups = analyzeRun(input).calibration.classSummaries!;
    expect(groups[0].judgeSummaries.find(group => group.judgeModel === undefined)?.total).toBe(1);
    expect(groups[0].categorySummaries[0].category).toBeUndefined();
    input.suites.push({ id: 'unrelated', total: 1, passed: 1, failed: 0 });
    input.rows.push({ ...input.rows[0], id: 'other', suite: 'unrelated', judgeLabel: undefined, groundTruthLabel: undefined });
    expect(classSummary(input).total).toBe(4);
  });
  it('rejects a calibration scale with different meaning for Pass', () => {
    const calibration = fixture();
    const current: EvalReportV1 = { ...calibration, run: { id: 'target', generatedAt: '2026-11-15T13:00:00Z' },
      suites: [{ id: 'answers', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'answer', suite: 'answers', passed: true, judgeModel: 'judge-a' }],
      suiteManifests: [{ ...calibration.suiteManifests![0], name: 'answers', target: 'agent', graders: ['llm-judge'],
        labelScale: { labels: [...labels].reverse(), passLabels: [labels[0]] }, gate: { mode: 'blocking', thresholds: {} } }] };
    const options = { current, reports: [calibration], gateConfig: { calibration: { enabled: true } } };
    expect(evaluateReportPolicy(options).gatePassed).toBe(true);
    current.suiteManifests![0].labelScale!.passLabels.push(labels[1]);
    expect(evaluateReportPolicy(options).gatePassed).toBe(false);
  });
  it('accepts valid named judge labels as taxonomy evidence, but not undeclared labels', () => {
    const input = fixture(); input.rows.forEach(row => { delete row.judgeVerdict; });
    expect(lintReportTaxonomy(input).issues.filter(issue => issue.code === 'missing-judge-verdict')).toHaveLength(0);
    input.rows[0].judgeLabel = 'undeclared';
    expect(lintReportTaxonomy(input).issues.filter(issue => issue.code === 'missing-judge-verdict')).toHaveLength(1);
  });
  it('preserves named labels through the portable runner adapter', () => {
    const input = fixture();
    const emitted = createEvalReportArtifact({ run: input.run, cases: input.rows, suiteManifests: input.suiteManifests });
    expect(emitted.rows[1]).toMatchObject({ judgeLabel: labels[0], groundTruthLabel: labels[1], groundTruthVerdict: false });
    expect(classSummary(emitted).kappa).toBeCloseTo(2 / 3);
  });
  it('keeps labels escaped and visible in all report formats', async () => {
    const input = fixture() as EvalReportV1 & { suiteManifests: Array<{ labelScale: { labels: string[]; passLabels: string[] } }>;
      rows: Array<{ judgeLabel: string; groundTruthLabel: string }> };
    const hostile = '<img src=x onerror=alert(1)>';
    input.suiteManifests[0].labelScale.labels[3] = hostile;
    input.rows[3].judgeLabel = hostile; input.rows[3].groundTruthLabel = hostile;
    const dir = await mkdtemp(path.join(tmpdir(), 'class-report-'));
    try {
      const outputs = await renderReports({ current: input, history: [], comparison: compareRuns(input), reportDir: dir },
        ['html', 'text', 'markdown-summary']);
      const html = await readFile(path.join(dir, 'index.html'), 'utf8');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(html).not.toContain(hostile);
      expect(outputs.join('\n')).toContain('partially answered');
      expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain('partially answered');
      expect(JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8')).analytics.calibration.classSummaries[0].total).toBe(4);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('imports agreed class reviews using the declared pass mapping', () => {
    const input = fixture();
    const bundle = exportUnresolvedRowsBundle(input);
    const row = bundle.rows[0] as typeof bundle.rows[number] & { labelScale?: unknown };
    expect(row.labelScale).toEqual({ labels, passLabels: [labels[0]] });
    row.reviews = [{ reviewer: 'a', label: labels[1] }, { reviewer: 'b', label: labels[1] }] as typeof row.reviews;
    const result = mergeAdjudicationBundle(input, bundle);
    expect(result.applied).toBe(1);
    expect(result.report.rows[1]).toMatchObject({ passed: false, groundTruthVerdict: false, groundTruthLabel: labels[1] });
    row.reviews = [{ reviewer: 'a', label: labels[1] }, { reviewer: 'b', label: labels[2] }] as typeof row.reviews;
    const disagreement = mergeAdjudicationBundle(input, bundle);
    expect(disagreement.skippedDisagreement).toBe(1);
    expect(disagreement.adjudicationDisagreements[0].verdicts.map(value => value.label)).toEqual([labels[1], labels[2]]);
    row.labelScale!.passLabels.push(labels[1]);
    expect(input.suiteManifests![0].labelScale!.passLabels).toEqual([labels[0]]);
    row.reviews = [{ label: labels[1], verdict: 'pass' }, { label: labels[1], verdict: 'pass' }];
    expect(mergeAdjudicationBundle(input, bundle).skippedInvalidVerdict).toBe(1);
  });
});
