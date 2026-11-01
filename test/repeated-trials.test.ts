import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeRepeatedTrials, describeRepeatedTrials, describeRepeatedTrialCase } from '../src/analytics/repeated-trials.js';
import { analyzeRun } from '../src/analytics/run-analytics.js';
import { comparePairedOutcomes } from '../src/analytics/paired-comparison.js';
import { REPEATED_SAMPLING_DESIGNS, type EvalReportV1, type EvalRow } from '../src/model/eval-report-v1.js';
import { validateEvalReport } from '../src/model/validate.js';
import { createEvalReportArtifact } from '../src/adapters/runner.js';
import { renderReports } from '../src/reporters/render.js';
import { compareRuns } from '../src/history/history.js';

const row = (passes = 95, runs = 100): EvalRow => ({ id: 'same', suite: 'quality', kind: 'deterministic', passed: true,
  repeated: { runs, passes, aggregation: 'majority', samplingDesign: 'fixed-independent' } });
const report = (rows: EvalRow[], id = 'current'): EvalReportV1 => ({ schemaVersion: 'eval-report/v1',
  run: { id, project: 'repeat-demo', generatedAt: '2026-11-01T00:00:00Z' }, rows,
  suites: [{ id: 'quality', total: rows.length, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length }],
  suiteManifests: [{ name: 'quality', target: 'custom', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1', graderVersion: '1',
    graders: ['deterministic-assertions'], riskArea: 'response-quality', gate: { mode: 'report-only', thresholds: {} } }] });

describe('within-case repeated-trial evidence', () => {
  it('computes the fixed-sample bound and a separately budgeted difference bound', () => {
    const current = report([row()]), before = report([row(80)], 'before');
    const result = summarizeRepeatedTrials(current, before), item = result.cases[0];
    const width = Math.sqrt(Math.log(2 / 0.05) / 200);
    const jointWidth = Math.sqrt(Math.log(4 / 0.05) / 200);
    expect(result).toMatchObject({ currentCases: 1, estimatedCases: 1, unknownCases: 0, estimatedComparisons: 1 });
    expect(item.current.interval!.lower).toBeCloseTo(0.95 - width);
    expect(item.current.interval!.upper).toBe(1);
    expect(item.comparison.observedDelta).toBeCloseTo(0.15);
    expect(describeRepeatedTrialCase(item)).toContain('observed rate 0.95 (95/100 matched)');
    expect(describeRepeatedTrialCase(item)).toContain('baseline 0.8 (80/100 matched)');
    expect(item.comparison.interval!.lower).toBeCloseTo(0.15 - 2 * jointWidth);
    expect(item.comparison.interval!.upper).toBeCloseTo(1 - (0.8 - jointWidth));
    expect(analyzeRun(current, before).repeatedTrials).toEqual(result);
  });
  it('keeps absent sampling design unknown while retaining observed counts', () => {
    const observed = row(); delete observed.repeated!.samplingDesign;
    const result = summarizeRepeatedTrials(report([observed]), report([row()], 'before'));
    expect(result.cases[0].current).toEqual({ status: 'unknown', reason: 'sampling-design-unknown', runs: 100, matchedExpectations: 95, observedRate: 0.95 });
    expect(result.cases[0].comparison.interval).toBeUndefined();
  });
  it('respects intentional negative outcomes rather than treating refusal as failure', () => {
    const result = summarizeRepeatedTrials(report([{ ...row(5), expectedOutcome: 'fail', passed: false }]));
    expect(result.cases[0].current).toMatchObject({ observedRate: 0.95, matchedExpectations: 95 });
    expect(result.cases[0].comparison.status).toBe('not-compared');
  });
  it('does not collapse all-pass or all-fail observations into zero-width intervals', () => {
    expect(summarizeRepeatedTrials(report([row(100)])).cases[0].current.interval!.lower).toBeLessThan(1);
    expect(summarizeRepeatedTrials(report([row(0)])).cases[0].current.interval!.upper).toBeGreaterThan(0);
  });
  it.each([0, 1, NaN, Infinity, -0.5])('rejects invalid confidence %s', value => {
    expect(() => summarizeRepeatedTrials(report([row()]), undefined, value)).toThrow('confidenceLevel');
  });
  it('handles the highest representable confidence without rounding a component level to one', () => {
    const result = summarizeRepeatedTrials(report([row()]), report([row()], 'before'), 1 - Number.EPSILON / 2);
    expect(Number.isFinite(result.cases[0].comparison.interval!.lower)).toBe(true);
  });
  it.each([[0, 0], [100, 101], [10.5, 2], [100, -1], [Number.MAX_SAFE_INTEGER + 1, 1]])('refuses unsafe or invalid counts %s/%s', (runs, passes) => {
    const result = summarizeRepeatedTrials(report([row(passes, runs)]));
    expect(result.cases[0].current).toEqual({ status: 'unknown', reason: 'invalid-counts' });
  });
  it('keeps duplicate identities unknown and does not leak a selected duplicate rate', () => {
    const result = summarizeRepeatedTrials(report([row(), row(10)]), report([row()], 'before'));
    expect(result.cases[0].current).toEqual({ status: 'unknown', reason: 'duplicate-identity' });
    expect(result.estimatedComparisons).toBe(0);
  });
  it('requires compatible measurement versions and unchanged grouping for differences', () => {
    const current = report([row()]), before = report([row()], 'before');
    current.suiteManifests![0].graderVersion = '2';
    expect(summarizeRepeatedTrials(current, before).estimatedComparisons).toBe(0);
    current.suiteManifests![0].graderVersion = '1'; current.rows[0].scenarioId = 'changed';
    expect(summarizeRepeatedTrials(current, before).cases[0].comparison.reason).toBe('case-grouping-changed');
  });
  it('keeps missing baseline repeat evidence unknown and emits no fake zero', () => {
    const before = row(); delete before.repeated;
    const result = summarizeRepeatedTrials(report([row()]), report([before], 'before'));
    expect(result.cases[0].previous?.observedRate).toBeUndefined();
    expect(result.cases[0].comparison.observedDelta).toBeUndefined();
    expect(summarizeRepeatedTrials(report([row()]), report([], 'before')).unavailableComparisons).toBe(1);
  });
  it('does not inflate the paired group count using within-case trial counts', () => {
    const current = report([row(10000, 10000)]), before = report([row(10000, 10000)], 'before');
    expect(comparePairedOutcomes(current, before, { independentClusters: true }).status).toBe('inconclusive');
    expect(summarizeRepeatedTrials(current, before).currentCases).toBe(1);
  });
  it('bounds evidence samples with stable ordering and retains full counts', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...row(), id: String(i).padStart(2, '0') }));
    const result = summarizeRepeatedTrials(report(rows));
    expect(result).toMatchObject({ currentCases: 30, estimatedCases: 30, caseCount: 30 });
    expect(result.cases).toHaveLength(20);
    expect(summarizeRepeatedTrials(report([...rows].reverse()))).toEqual(result);
    expect(describeRepeatedTrials(result)).toContain('Trials are not pooled');
  });
  it('explains unknown evidence in plain English while retaining machine-readable reasons', () => {
    const observed = row(); delete observed.repeated!.samplingDesign;
    const entry = summarizeRepeatedTrials(report([observed])).cases[0];
    expect(entry.current.reason).toBe('sampling-design-unknown');
    expect(describeRepeatedTrialCase(entry)).toContain('sampling design was not declared');
    expect(describeRepeatedTrialCase(entry)).not.toContain('sampling-design-unknown');
    for (const reason of ['constructor', '__proto__', 'toString']) {
      expect(describeRepeatedTrialCase({ ...entry, comparison: { status: 'unknown', reason } })).toContain('evidence is unavailable');
    }
  });
  it('keeps reports without current repeated cases quiet while JSON retains explicit counts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'no-repeated-evidence-'));
    try {
      const single = row(); delete single.repeated;
      const current = report([single]);
      const outputs = await renderReports({ current, comparison: compareRuns(current), history: [], reportDir: dir }, ['html', 'markdown-summary', 'text', 'json-summary']);
      const summary = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
      expect(summary.analytics.repeatedTrials).toMatchObject({ currentCases: 0, estimatedCases: 0, unknownCases: 0, cases: [] });
      expect(await readFile(path.join(dir, 'index.html'), 'utf8')).not.toContain('Repeated trials: 0/0');
      expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).not.toContain('Repeated trials: 0/0');
      expect(JSON.stringify(outputs)).not.toContain('Repeated trials: 0/0');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('validates additive sampling metadata and preserves it through the generic emitter', async () => {
    const emitted = createEvalReportArtifact({ cases: [{ ...row(5), expectedOutcome: 'fail', passed: false }] });
    expect(emitted.rows[0]).toMatchObject({ repeated: row(5).repeated, expectedOutcome: 'fail' });
    expect(validateEvalReport(report([row()])).ok).toBe(true);
    const legacy = row(); delete legacy.repeated!.samplingDesign;
    expect(validateEvalReport(report([legacy])).ok).toBe(true);
    for (const value of ['adaptive', null, 1, true]) {
      const input = report([row()]); (input.rows[0].repeated as unknown as Record<string, unknown>).samplingDesign = value;
      expect(validateEvalReport(input).ok).toBe(false);
    }
    const schema = JSON.parse(await readFile('schemas/eval-report-v1.schema.json', 'utf8'));
    expect(schema.definitions.EvalRow.properties.repeated.properties.samplingDesign.enum).toEqual([...REPEATED_SAMPLING_DESIGNS]);
    expect(schema.definitions.EvalRow.properties.repeated.required).not.toContain('samplingDesign');
  });
  it('renders shared evidence in JSON, HTML, Markdown and text and escapes HTML', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'repeated-evidence-'));
    try {
      const current = report([{ ...row(), id: '\u001b[2J<img src=x onerror=alert(1)>\r\nforged' }]);
      const result = await renderReports({ current, comparison: compareRuns(current), history: [], reportDir: dir }, ['html', 'markdown-summary', 'text', 'json-summary']);
      const summary = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
      expect(summary.analytics.repeatedTrials).toEqual(JSON.parse(JSON.stringify(summarizeRepeatedTrials(current))));
      const html = await readFile(path.join(dir, 'index.html'), 'utf8');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')).not.toContain('<img src=x onerror=alert(1)>');
      expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain('Repeated trials: 1/1 cases');
      expect(JSON.stringify(result)).toContain('Repeated trials: 1/1 cases');
      const text = result.find(output => output.startsWith('Run:'))!;
      expect(text).not.toContain('\u001b');
      expect(text).not.toContain('\r');
      expect(text).not.toContain('\nforged');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
