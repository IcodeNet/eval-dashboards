import { describe, expect, it } from 'vitest';
import { evaluateReportPolicy, type EvalReportV1 } from '../src/index.js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = () => {
  const current: EvalReportV1 = {
    schemaVersion: 'eval-report/v1', run: { id: 'current', project: 'demo', generatedAt: '2026-11-06T12:00:00Z' },
    suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
    rows: [{ id: 'case', suite: 'quality', passed: true, judgeModel: 'judge-a' }],
    suiteManifests: [{ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: '1',
      rubricVersion: '1', graders: ['llm-judge'], riskArea: 'response-quality', gate: { mode: 'blocking', thresholds: {} } }],
  };
  const evidence: EvalReportV1 = {
    ...structuredClone(current), run: { ...current.run, id: 'calibration', generatedAt: '2026-11-06T11:00:00Z', kind: 'calibration' },
    suites: [{ id: 'judge-calibration', total: 1, passed: 1, failed: 0 }],
    rows: [{ id: 'label', suite: 'judge-calibration', passed: true, judgeModel: 'judge-a', judgeVerdict: true, groundTruthVerdict: true }],
    suiteManifests: [{ ...current.suiteManifests![0], name: 'judge-calibration', graders: ['human-labelled-calibration'],
      gate: { mode: 'report-only', thresholds: { minJudgeAgreementRate: 0.8 } } }],
  };
  return { current, evidence };
};
const evaluate = ({ current, evidence }: ReturnType<typeof fixture>, allow = false) => evaluateReportPolicy({
  current, reports: [evidence, current], gateConfig: { calibration: { enabled: true, allowBlockingWithoutRecentMatch: allow } },
});

describe('calibration preflight requires passing agreement evidence', () => {
  it('accepts paired labels meeting an explicit agreement bar without mutating the artifact', () => {
    const input = fixture(), before = structuredClone(input);
    expect(evaluate(input).gatePassed).toBe(true);
    expect(input).toEqual(before);
  });
  it('rejects a human label without a judge verdict', () => {
    const input = fixture(); delete input.evidence.rows[0].judgeVerdict;
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it.each<Record<string, number>>([{}, { passRate: 1 }, { maxAxisScoreDelta: 0.1 }])('requires a declared agreement bar, not %j', thresholds => {
    const input = fixture(); input.evidence.suiteManifests![0].gate.thresholds = thresholds;
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it('rejects failed agreement even if the row and declared summary say passed', () => {
    const input = fixture(); input.evidence.rows[0].judgeVerdict = false;
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it('cannot pool another judge’s passing labels to qualify a failing judge', () => {
    const input = fixture(); input.evidence.rows[0].judgeVerdict = false;
    input.evidence.rows.push(...Array.from({ length: 9 }, (_, i) => ({ ...input.evidence.rows[0], id: `other-${i}`, judgeModel: 'judge-b', judgeVerdict: true })));
    input.evidence.suites[0] = { id: 'judge-calibration', total: 10, passed: 10, failed: 0 };
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it('rejects a missing suite summary', () => {
    const input = fixture(); input.evidence.suites = [];
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it('preserves the explicit warning-only escape for failed evidence', () => {
    const input = fixture(); input.evidence.rows[0].judgeVerdict = false;
    const result = evaluate(input, true);
    expect(result.gatePassed).toBe(true);
    expect(result.combinedDiagnostics.join(' ')).toContain('warning-only');
  });
  it('accepts a disagreement bar and genuinely paired false verdicts', () => {
    const input = fixture(); input.evidence.suiteManifests![0].gate.thresholds = { maxJudgeDisagreementRate: 0 };
    input.evidence.rows[0].judgeVerdict = false; input.evidence.rows[0].groundTruthVerdict = false;
    expect(evaluate(input).gatePassed).toBe(true);
  });
  it('resolves a unique display name to ID-keyed calibration rows', () => {
    const input = fixture(); input.evidence.suites[0].id = 'calibration-id'; input.evidence.suites[0].name = 'judge-calibration';
    input.evidence.rows[0].suite = 'calibration-id';
    expect(evaluate(input).gatePassed).toBe(true);
  });
  it.each(['min_judge_agreement_rate', 'judge-agreement-rate', 'max_judge_disagreement_rate', 'judge-disagreement-rate'])('honours the supported %s alias', key => {
    const input = fixture(); input.evidence.suiteManifests![0].gate.thresholds = { [key]: key.includes('disagreement') ? 0 : 1 };
    expect(evaluate(input).gatePassed).toBe(true);
    input.evidence.rows[0].judgeVerdict = false;
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it.each(['stale', 'future', 'same-run', 'wrong-rubric', 'duplicate-manifest', 'ambiguous-summary'] as const)('rejects %s evidence even with passing labels', reason => {
    const input = fixture();
    if (reason === 'stale') input.evidence.run.generatedAt = '2026-10-01T00:00:00Z';
    if (reason === 'future') input.evidence.run.generatedAt = '2026-11-07T00:00:00Z';
    if (reason === 'same-run') input.evidence.run.id = input.current.run.id;
    if (reason === 'wrong-rubric') {
      input.current.suiteManifests!.push({ ...input.evidence.suiteManifests![0], rubricVersion: '2' });
    }
    if (reason === 'duplicate-manifest') input.evidence.suiteManifests!.push(structuredClone(input.evidence.suiteManifests![0]));
    if (reason === 'ambiguous-summary') input.evidence.suites.push(structuredClone(input.evidence.suites[0]));
    expect(evaluate(input).gatePassed).toBe(false);
  });
  it('warns for a report-only target when calibration fails', () => {
    const input = fixture(); input.current.suiteManifests![0].gate.mode = 'report-only';
    input.evidence.rows[0].judgeVerdict = false;
    const result = evaluate(input);
    expect(result.gatePassed).toBe(true);
    expect(result.combinedDiagnostics.join(' ')).toContain('warning-only');
  });
  it('enforces the same evidence quality in the real CLI', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'calibration-preflight-'));
    try {
      const input = fixture(); input.evidence.rows[0].judgeVerdict = false;
      await writeFile(path.join(directory, 'current.json'), JSON.stringify(input.current));
      await writeFile(path.join(directory, 'evidence.json'), JSON.stringify(input.evidence));
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
        fileURLToPath(new URL('../src/cli/index.ts', import.meta.url)), 'check', `--input=${directory}`, '--calibration-preflight'],
      { cwd: directory, encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('passing declared agreement thresholds');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
