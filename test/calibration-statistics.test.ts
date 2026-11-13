import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRun, checkGates, compareRuns, evaluateReportPolicy, renderReports, type EvalReportV1 } from '../src/index.js';

const report = (pairs: Array<[boolean, boolean]> = [[false, false], [false, true], [true, true], [true, true]]): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'calibration', generatedAt: '2026-11-06T11:00:00Z', kind: 'calibration' },
  suites: [{ id: 'judge-calibration', total: pairs.length, passed: pairs.length, failed: 0 }],
  rows: pairs.map(([judgeVerdict, groundTruthVerdict], i) => ({ id: `pair-${i}`, suite: 'judge-calibration', passed: true,
    judgeVerdict, groundTruthVerdict, judgeModel: 'judge-a', groundTruthCategory: i < 2 ? 'first' : 'second' })),
  suiteManifests: [{ name: 'judge-calibration', target: 'judge', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1',
    graders: ['human-labelled-calibration'], riskArea: 'response-quality', gate: { mode: 'blocking', thresholds: {} } }],
});
const check = (input: EvalReportV1) => checkGates(input, compareRuns(input), {});

describe('calibration agreement statistics', () => {
  it('reports the observed agreement and marginal-label correction together', () => {
    // Human labels are balanced; the judge has three true labels: expected agreement .5.
    const input = report([[false, false], [true, false], [true, true], [true, true]]);
    const result = analyzeRun(input).calibration;
    expect(result).toMatchObject({ total: 4, agreements: 3, disagreements: 1, agreementRate: 0.75,
      expectedAgreementRate: 0.5, kappa: 0.5, kappaStatus: 'defined' });
    expect(result.labelCounts).toEqual([
      { label: false, judge: 1, human: 2, matches: 1, agreementRate: 0.5 },
      { label: true, judge: 3, human: 2, matches: 2, agreementRate: 1 },
    ]);
  });
  it.each([
    { pairs: [[false, false], [true, true]], kappa: 1 },
    { pairs: [[true, false], [false, true]], kappa: -1 },
  ])('handles balanced agreement and disagreement (%j)', ({ pairs, kappa }) => {
    expect(analyzeRun(report(pairs as Array<[boolean, boolean]>)).calibration.kappa).toBe(kappa);
  });
  it('shows that 90% agreement from always predicting the majority label has kappa zero', () => {
    const pairs: Array<[boolean, boolean]> = Array.from({ length: 10 }, (_, i) => [true, i !== 0]);
    expect(analyzeRun(report(pairs)).calibration).toMatchObject({ total: 10, agreementRate: 0.9, expectedAgreementRate: 0.9, kappa: 0 });
  });
  it('keeps a one-class perfect sample undefined rather than manufacturing kappa one', () => {
    expect(analyzeRun(report([[true, true], [true, true]])).calibration).toMatchObject({ total: 2, agreementRate: 1,
      kappa: undefined, kappaStatus: 'degenerate' });
  });
  it('keeps empty and one-sided labels explicit', () => {
    const input = report(); input.rows.forEach(row => { delete row.judgeVerdict; });
    expect(analyzeRun(input).calibration).toMatchObject({ total: 0, agreementRate: undefined, kappa: undefined, kappaStatus: 'no-pairs' });
  });
  it('breaks down human label categories without using failure taxonomy as outcome classes', () => {
    const input = report(); input.rows.forEach(row => { row.category = 'unrelated-failure-category'; });
    const result = analyzeRun(input).calibration;
    expect(result.categorySummaries).toMatchObject([{ category: 'first', total: 2, agreementRate: 0.5 }, { category: 'second', total: 2, agreementRate: 1 }]);
    expect(result.judgeSummaries).toMatchObject([{ judgeModel: 'judge-a', total: 4 }]);
  });
  it('reports missing category and judge metadata without inventing identifiers', () => {
    const input = report(); input.rows.forEach(row => { delete row.groundTruthCategory; delete row.judgeModel; });
    expect(analyzeRun(input).calibration.categorySummaries).toMatchObject([{ category: undefined, total: 4 }]);
    expect(analyzeRun(input).calibration.judgeSummaries).toMatchObject([{ judgeModel: undefined, total: 4 }]);
  });
  it('does not gate kappa by default, but enforces an explicit minimum', () => {
    const input = report([[true, true], [true, false]]);
    expect(check(input).passed).toBe(true);
    input.suiteManifests![0].gate.thresholds = { minJudgeKappa: 0.5 };
    expect(check(input).failures.join(' ')).toContain('judge agreement score (kappa) 0.000 is below');
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0;
    expect(check(input).passed).toBe(true);
  });
  it.each(['minJudgeKappa', 'min_judge_kappa', 'min-judge-kappa'])('supports the explicit %s gate', key => {
    const input = report([[false, false], [true, true]]); input.suiteManifests![0].gate.thresholds = { [key]: 1 };
    expect(check(input).passed).toBe(true);
  });
  it('fails an explicit kappa gate when the metric is undefined', () => {
    const input = report([[true, true]]); input.suiteManifests![0].gate.thresholds = { minJudgeKappa: 0 };
    expect(check(input).failures.join(' ')).toContain('cannot calculate the judge agreement score (kappa): everyone chose the same answer');
  });
  it('fails an explicit kappa gate with no paired observations', () => {
    const input = report(); input.rows.forEach(row => { delete row.groundTruthVerdict; });
    input.suiteManifests![0].gate.thresholds = { minJudgeKappa: 0 };
    expect(check(input).failures.join(' ')).toContain('cannot calculate the judge agreement score (kappa): no examples have both');
  });
  it('preserves report-only enforcement and permits an explicit negative bar', () => {
    const input = report([[true, false], [false, true]]);
    input.suiteManifests![0].gate.thresholds = { minJudgeKappa: -1 };
    expect(check(input).passed).toBe(true);
    input.suiteManifests![0].gate.mode = 'report-only';
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 1;
    expect(check(input).passed).toBe(true);
  });
  it.each([-2, 2, NaN, Infinity])('rejects invalid kappa bar %s', threshold => {
    const input = report(); input.suiteManifests![0].gate.thresholds = { minJudgeKappa: threshold };
    expect(check(input).failures.join(' ')).toContain('must be a number between -1 and 1');
  });
  it('accepts a defined kappa bar as preflight agreement evidence for the matching judge', () => {
    const evidence = report([[false, false], [true, true]]); evidence.suiteManifests![0].gate.thresholds = { minJudgeKappa: 0.5 };
    const current: EvalReportV1 = { ...structuredClone(evidence), run: { id: 'current', generatedAt: '2026-11-06T12:00:00Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }], rows: [{ id: 'case', suite: 'quality', passed: true, judgeModel: 'judge-a' }],
      suiteManifests: [{ ...evidence.suiteManifests![0], name: 'quality', graders: ['llm-judge'], gate: { mode: 'blocking', thresholds: {} } }],
    };
    expect(evaluateReportPolicy({ current, reports: [evidence, current], gateConfig: { calibration: { enabled: true } } }).gatePassed).toBe(true);
    evidence.rows[1].judgeModel = 'judge-b';
    expect(evaluateReportPolicy({ current, reports: [evidence, current], gateConfig: { calibration: { enabled: true } } }).gatePassed).toBe(false);
  });
  it('is symmetric under swapping annotators and does not mutate rows', () => {
    const input = report(), before = structuredClone(input);
    const swapped = structuredClone(input);
    swapped.rows.forEach(row => { [row.judgeVerdict, row.groundTruthVerdict] = [row.groundTruthVerdict, row.judgeVerdict]; });
    expect(analyzeRun(input).calibration.kappa).toBe(analyzeRun(swapped).calibration.kappa);
    expect(input).toEqual(before);
  });
  it('shows the same metrics in JSON, text, Markdown, escaped offline HTML and CLI gates', async () => {
    const current = report(); current.rows[0].groundTruthCategory = '<script>unsafe</script>';
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-stats-'));
    try {
      const outputs = await renderReports({ current, comparison: compareRuns(current), history: [], reportDir: directory }, ['json-summary', 'text', 'markdown-summary', 'html']);
      const json = JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
      expect(json.analytics.calibration.kappa).toBeCloseTo(0.5);
      expect(outputs.join('\n')).toContain('kappa=0.500');
      const html = await readFile(path.join(directory, 'index.html'), 'utf8');
      expect(html).toContain("Cohen's kappa");
      expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
      expect(html).not.toContain('<script>unsafe</script>');
      expect(await readFile(path.join(directory, 'summary.md'), 'utf8')).toContain('kappa=0.500');
      const inputDirectory = path.join(directory, 'input'); await mkdir(inputDirectory);
      const inputFile = path.join(inputDirectory, 'report.json');
      const jsonOutput = path.join(directory, 'check-result.json');
      const runCheck = () => spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
        fileURLToPath(new URL('../src/cli/index.ts', import.meta.url)), 'check', `--input=${inputDirectory}`, `--json-out=${jsonOutput}`],
      { cwd: directory, encoding: 'utf8', timeout: 30_000 });
      current.suiteManifests![0].gate.thresholds = { minJudgeKappa: 0.75 };
      await writeFile(inputFile, JSON.stringify(current));
      const failed = runCheck(); expect(failed.status, failed.stderr).toBe(1);
      expect(failed.stderr).toContain('judge agreement score (kappa) 0.500 is below');
      expect(JSON.parse(await readFile(jsonOutput, 'utf8')).passed).toBe(false);
      current.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.5;
      await writeFile(inputFile, JSON.stringify(current));
      const passed = runCheck(); expect(passed.status, passed.stderr).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('keeps all groups in JSON while limiting the human-readable category breakdown', async () => {
    const input = report(Array.from({ length: 21 }, (_, i) => [i % 2 === 0, i % 2 === 0]));
    input.rows.forEach((row, i) => { row.groundTruthCategory = `category-${i}`; });
    expect(analyzeRun(input).calibration.categorySummaries).toHaveLength(21);
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-groups-'));
    try {
      await renderReports({ current: input, comparison: compareRuns(input), history: [], reportDir: directory }, ['html', 'json-summary']);
      const html = await readFile(path.join(directory, 'index.html'), 'utf8');
      expect(html).toContain('Showing 20 of 21 groups');
      const categoryTable = html.match(/<h3>Reviewer category<\/h3>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1];
      expect(categoryTable).toBeDefined();
      expect(categoryTable!.match(/<tr>/g)).toHaveLength(20);
      const shown = [...categoryTable!.matchAll(/<td>(category-\d+)<\/td>/g)].map(match => match[1]);
      expect(new Set(shown).size).toBe(20);
      expect(shown.every(category => input.rows.some(row => row.groundTruthCategory === category))).toBe(true);
      const saved = JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
      expect(saved.analytics.calibration.categorySummaries).toHaveLength(21);
      expect(saved.analytics.calibration.categorySummaries.map((group: { category: string }) => group.category).sort())
        .toEqual(input.rows.map(row => row.groundTruthCategory).sort());
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('shows missing paired evidence explicitly in offline HTML', async () => {
    const current = report(); current.rows.forEach(row => { delete row.judgeVerdict; });
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-empty-'));
    try {
      await renderReports({ current, comparison: compareRuns(current), history: [], reportDir: directory }, ['html']);
      const html = await readFile(path.join(directory, 'index.html'), 'utf8');
      expect(html).toContain('Unavailable (no examples with both decisions)');
      expect(html).toContain('0 reviewed examples');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
