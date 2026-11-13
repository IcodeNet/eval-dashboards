import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../docs-site/node_modules/satteri/dist/index.js';
import { checkGates, compareRuns, describeCalibration, evaluateReportPolicy, renderReports, summarizeCalibration, type EvalReportV1 } from '../src/index.js';

const report = (pairs: Array<[boolean, boolean]> = [[true, true], [false, true], [false, false]]): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'calibration', generatedAt: '2026-11-08T11:00:00Z', kind: 'calibration' },
  suites: [{ id: 'judge-calibration', total: pairs.length, passed: pairs.length, failed: 0 }],
  rows: pairs.map(([judgeVerdict, groundTruthVerdict], i) => ({ id: `pair-${i}`, suite: 'judge-calibration', passed: true,
    judgeVerdict, groundTruthVerdict, judgeModel: 'judge-a', groundTruthCategory: 'reviewed' })),
  suiteManifests: [{ name: 'judge-calibration', target: 'judge', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1',
    graders: ['human-labelled-calibration'], riskArea: 'response-quality', gate: { mode: 'blocking', thresholds: { minJudgeKappa: 0.4 } } }],
});
const check = (input: EvalReportV1) => checkGates(input, compareRuns(input), {});

describe('calibration review follow-up', () => {
  it('accepts an exact 0.4 minimum without accepting a genuinely stricter minimum', () => {
    const input = report();
    expect(check(input).passed).toBe(true);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.4000000000000001;
    expect(check(input).passed).toBe(false);
    expect(check(input).failures.join(' ')).toContain('minJudgeKappa=0.4000000000000001');
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.39999999999999997;
    expect(check(input).passed).toBe(true);
  });
  it('applies the same exact minimum when accepting a previous judge review', () => {
    const evidence = report();
    const current: EvalReportV1 = { ...structuredClone(evidence), run: { id: 'current', generatedAt: '2026-11-08T12:00:00Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }], rows: [{ id: 'case', suite: 'quality', passed: true, judgeModel: 'judge-a' }],
      suiteManifests: [{ ...evidence.suiteManifests![0], name: 'quality', graders: ['llm-judge'], gate: { mode: 'blocking', thresholds: {} } }],
    };
    expect(evaluateReportPolicy({ current, reports: [evidence, current], gateConfig: { calibration: { enabled: true } } }).gatePassed).toBe(true);
  });
  it('keeps small positive and negative requirements meaningful', () => {
    const input = report([[true, true], [true, true], [true, false]]);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 1e-7;
    expect(check(input).passed).toBe(false);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = -1e-7;
    expect(check(input).passed).toBe(true);
  });
  it('does not accept a decimal minimum just above an exact five-sixths score', () => {
    const pairs: Array<[boolean, boolean]> = [
      ...Array.from({ length: 6 }, (): [boolean, boolean] => [true, true]),
      ...Array.from({ length: 5 }, (): [boolean, boolean] => [false, false]), [true, false],
    ];
    const input = report(pairs);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.8333333333333334;
    expect(check(input).passed).toBe(false);
    input.suiteManifests![0].gate.thresholds.minJudgeKappa = 0.8333333333333333;
    expect(check(input).passed).toBe(true);
  });
  it.each(['suite', 'judgeModel', 'groundTruthCategory'] as const)('shows %s names as literal text when Markdown is rendered', async field => {
    const input = report();
    const value = '``\u0000` [approved](https://example.invalid/item) ![image](https://example.invalid/image.png) <tag>';
    input.rows.forEach(row => { row[field] = value; });
    if (field === 'suite') { input.suites[0].id = value; input.suiteManifests![0].name = value; }
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-markdown-'));
    try {
      await renderReports({ current: input, comparison: compareRuns(input), history: [], reportDir: directory }, ['markdown-summary']);
      const markdown = await readFile(path.join(directory, 'summary.md'), 'utf8');
      const section = markdown.split(/## (?:Calibration agreement|Judge agreement with people)\n/)[1]?.split('\n## ')[0];
      expect(section).toBeDefined();
      const { html } = markdownToHtml(section!, { features: { gfm: true, rawHtml: true } });
      expect(html).not.toContain('<a ');
      expect(html).not.toContain('<img ');
      expect(html).not.toContain('<tag>');
      expect(html).toContain('&lt;tag&gt;');
      expect(html).toContain('[approved]');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('shows the agreement expected from answer counts in every readable format', async () => {
    const current = report([[false, false], [true, false], [true, true], [true, true]]);
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-expected-'));
    try {
      const output = await renderReports({ current, comparison: compareRuns(current), history: [], reportDir: directory }, ['text', 'markdown-summary', 'html']);
      expect(output.join('\n')).toContain('expected agreement=0.500');
      expect(await readFile(path.join(directory, 'summary.md'), 'utf8')).toContain('expected agreement=0.500');
      expect(await readFile(path.join(directory, 'index.html'), 'utf8')).toContain('Expected agreement');
      current.rows.forEach(row => { delete row.judgeVerdict; });
      expect(describeCalibration(summarizeCalibration(current.rows))).toContain('expected agreement=unknown');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
