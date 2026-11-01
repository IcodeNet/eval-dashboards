import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateReportPolicy, compareRuns, renderReports, type EvalReportV1, type WaiverRegisterV1 } from '../src/index.js';

const report = (passed = true, id = 'current'): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id, project: 'policy-demo', generatedAt: id === 'previous' ? '2026-10-30T00:00:00Z' : '2026-11-01T00:00:00Z' },
  suites: [{ id: 'quality', total: 100, passed: passed ? 100 : 0, failed: passed ? 0 : 100 }],
  rows: Array.from({ length: 100 }, (_, i) => ({ id: `case-${i}`, suite: 'quality', passed })),
  suiteManifests: [{ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1', graderVersion: '1',
    graders: ['deterministic-assertions'], riskArea: 'response-quality', gate: { mode: 'report-only', thresholds: {} } }],
});
const waivers: WaiverRegisterV1 = { schemaVersion: 'eval-waiver-register/v1', waivers: [{ id: 'known', suite: 'quality', reason: 'Known false positives',
  riskOwner: 'reviewer', ticket: 'TEST-1', expiresAt: '2026-11-02T00:00:00Z' }] };
const now = new Date('2026-11-01T12:00:00Z');

describe('complete reusable report policy', () => {
  it('uses explicit evaluation time for waivers without mutating artifacts or the register', () => {
    const current = report(false), before = structuredClone(current), registerBefore = structuredClone(waivers);
    const result = evaluateReportPolicy({ current, waiverRegister: waivers, gateConfig: { minPassRate: 1 }, now });
    expect(result.gateDecision.status).toBe('passed');
    expect(result.waiverApplication.active).toHaveLength(1);
    expect(current).toEqual(before); expect(waivers).toEqual(registerBefore);
    const expired = evaluateReportPolicy({ current, waiverRegister: waivers, now: new Date('2026-11-03T00:00:00Z') });
    expect(expired.gateDecision.status).toBe('failed');
    expect(expired.combinedFailures.join(' ')).toContain('expired');
  });
  it('keeps raw paired observations when waivers change ordinary gates', () => {
    const result = evaluateReportPolicy({ current: report(false), previous: report(true, 'previous'), waiverRegister: waivers,
      gateConfig: { minPassRate: 1, paired: { independentClusters: true } }, now });
    expect(result.gateDecision).toMatchObject({ status: 'failed', uncertainty: { observedDelta: -1 } });
    expect(result.waiverApplication.reportForGating.rows.every(row => row.passed)).toBe(true);
  });
  it('keeps inconclusive evidence distinct and gives expired waivers priority', () => {
    const input = { current: report(), previous: report(true, 'previous'), gateConfig: { paired: { independentClusters: true } }, now };
    expect(evaluateReportPolicy(input).gateDecision.status).toBe('inconclusive');
    const result = evaluateReportPolicy({ ...input, waiverRegister: waivers, now: new Date('2026-11-03T00:00:00Z') });
    expect(result.gateDecision.status).toBe('failed');
    expect(result.gateDecision.uncertainty?.status).toBe('inconclusive');
  });
  it('detects threshold loosening and preserves explicit permission diagnostics', () => {
    const input = { current: report(), gateConfig: { minPassRate: 0.9 }, baselineGateConfig: { minPassRate: 1 }, now };
    expect(evaluateReportPolicy(input).gateDecision.status).toBe('failed');
    const allowed = evaluateReportPolicy({ ...input, allowGateLoosening: true });
    expect(allowed.gateDecision.status).toBe('passed');
    expect(allowed.thresholdChangeResult?.loosened).toBe(true);
    expect(allowed.combinedDiagnostics.join(' ')).toContain('explicitly allowed');
  });
  it('includes tier budget failures while retaining unknown cost coverage', () => {
    const current = report(); current.rows[0].usage = { costUsd: 2 }; current.rows[0].durationMs = 100;
    const result = evaluateReportPolicy({ current, prTierBudget: { tier: 'pr', maxCostUsd: 1, maxDurationMs: 50 }, now });
    expect(result.gateDecision.status).toBe('failed');
    expect(result.prTierBudget?.summary).toMatchObject({ totalCostUsd: 2, totalDurationMs: 100, rowsMissingCost: 99 });
    expect(result.combinedFailures).toHaveLength(2);
  });
  it('requires recent matching calibration from a different run for a blocking judge suite', () => {
    const current = report(); current.suiteManifests![0].graders = ['llm-judge']; current.suiteManifests![0].gate.mode = 'blocking';
    current.rows[0].judgeModel = 'judge-1';
    const input = { current, gateConfig: { calibration: { enabled: true } }, now };
    expect(evaluateReportPolicy(input).combinedFailures.join(' ')).toContain('no matching calibration run');
    const calibration = report(true, 'previous'); calibration.run.kind = 'calibration';
    calibration.suiteManifests![0].name = 'judge-calibration';
    calibration.suites = [{ id: 'judge-calibration', total: 1, passed: 1, failed: 0 }];
    calibration.rows = [{ id: 'labelled', suite: 'judge-calibration', passed: true, judgeModel: 'judge-1', groundTruthVerdict: true }];
    expect(evaluateReportPolicy({ ...input, reports: [calibration, current] }).gateDecision.status).toBe('passed');
    calibration.rows[0].judgeModel = 'other';
    expect(evaluateReportPolicy({ ...input, reports: [calibration, current] }).gateDecision.status).toBe('failed');
  });
  it.each(['passed', 'failed', 'inconclusive'] as const)('renders the public %s verdict with the same configured comparison evidence', async status => {
    const current = report(status !== 'failed'), previous = report(status !== 'passed', 'previous');
    const gateConfig = { paired: { independentClusters: true, confidenceLevel: 0.8 } };
    const evaluation = evaluateReportPolicy({ current, previous, gateConfig, now });
    expect(evaluation.gateDecision.status).toBe(status);
    const dir = await mkdtemp(path.join(tmpdir(), 'public-policy-report-'));
    try {
      const outputs = await renderReports({ current, previous, history: [], comparison: compareRuns(current, previous), reportDir: dir,
        gateDecision: evaluation.gateDecision, paired: evaluation.gateConfig.paired }, ['html', 'markdown-summary', 'text', 'json-summary']);
      const summary = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
      expect(summary.gateDecision).toEqual(JSON.parse(JSON.stringify(evaluation.gateDecision)));
      expect(summary.analytics.pairedComparison).toEqual(summary.gateDecision.uncertainty);
      expect(summary.analytics.pairedComparison.confidenceLevel).toBe(0.8);
      expect(outputs.join('\n')).toContain(`Gate decision:    ${status}`);
      expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain(`| Gate decision | ${status} |`);
      expect(await readFile(path.join(dir, 'index.html'), 'utf8')).toContain(`>${status}</span>`);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('rejects invalid policies and invalid evaluation dates', () => {
    for (const gateConfig of [{ minPassRate: 2 }, { calibration: { maxAgeHours: -1 } }, { paired: { confidenceLevel: 1 } }]) {
      expect(() => evaluateReportPolicy({ current: report(), gateConfig })).toThrow();
    }
    expect(() => evaluateReportPolicy({ current: report(), now: new Date('invalid') })).toThrow('valid Date');
    expect(() => evaluateReportPolicy({ current: report(), baselineGateConfig: { paired: { confidenceLevel: 1 } } })).toThrow('Invalid paired policy');
  });
  it('sanitizes composed evidence without changing the original waiver', () => {
    const register = structuredClone(waivers); register.waivers[0].reason = '\u001b[2Jknown';
    const result = evaluateReportPolicy({ current: report(false), waiverRegister: register, now });
    expect(result.combinedDiagnostics.join(' ')).not.toContain('\u001b');
    expect(register.waivers[0].reason).toContain('\u001b');
  });
});
