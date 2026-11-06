import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGates } from '../src/gates/check-gates.js';
import { evaluateReportPolicy } from '../src/gates/evaluate-policy.js';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1, EvalRow } from '../src/model/eval-report-v1.js';

const report = (thresholds: Record<string, number>, row: Partial<EvalRow> = {}, mode: 'blocking' | 'report-only' = 'blocking'): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'calibration-missing-evidence', kind: 'calibration', generatedAt: '2026-11-06T00:00:00Z' },
  suites: [{ id: 'judge-calibration', total: 1, passed: 1, failed: 0 }],
  rows: [{ id: 'case-1', suite: 'judge-calibration', passed: true, kind: 'llm-judge', judgeModel: 'synthetic-judge', ...row }],
  suiteManifests: [{ name: 'judge-calibration', target: 'agent', datasetSource: 'synthetic', datasetVersion: 'v1', rubricVersion: 'v1',
    riskArea: 'response-quality', graders: ['llm-judge'], gate: { mode, thresholds } }],
});
const check = (input: EvalReportV1) => checkGates(input, compareRuns(input), {});

describe('calibration thresholds require measured evidence', () => {
  it.each<Record<string, number>>([
    { minJudgeAgreementRate: 0.8 }, { minJudgeAgreementRate: 0 },
    { maxJudgeDisagreementRate: 0.2 }, { maxJudgeDisagreementRate: 1 },
  ])('fails a blocking verdict threshold when no labelled pairs exist (%j)', thresholds => {
    const result = check(report(thresholds));
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toMatch(/no labelled judge\/human verdict pairs/i);
  });
  it.each([{ judgeVerdict: true }, { groundTruthVerdict: false }])('does not treat one-sided labels as paired evidence (%j)', row => {
    expect(check(report({ minJudgeAgreementRate: 0.8 }, row)).passed).toBe(false);
  });
  it.each<Partial<EvalRow>>([
    {}, { axisScores: { accuracy: 0.7 } }, { groundTruthAxisScores: { accuracy: 0.7 } },
    { axisScores: { accuracy: 0.7 }, groundTruthAxisScores: { safety: 0.7 } },
  ])('fails an axis-delta threshold without matching scored axes (%j)', row => {
    const result = check(report({ maxAxisScoreDelta: 0.1 }, row));
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toMatch(/no matching judge\/human axis-score pairs/i);
  });
  it('distinguishes an observed zero agreement from no agreement evidence', () => {
    expect(check(report({ minJudgeAgreementRate: 0, maxJudgeDisagreementRate: 1 }, { judgeVerdict: true, groundTruthVerdict: false })).passed).toBe(true);
    expect(check(report({ minJudgeAgreementRate: 0.8 }, { judgeVerdict: true, groundTruthVerdict: false })).passed).toBe(false);
  });
  it('counts paired false verdicts and an observed zero axis delta', () => {
    expect(check(report({ minJudgeAgreementRate: 1, maxJudgeDisagreementRate: 0, maxAxisScoreDelta: 0 }, {
      judgeVerdict: false, groundTruthVerdict: false, axisScores: { accuracy: 0.7 }, groundTruthAxisScores: { accuracy: 0.7 },
    })).passed).toBe(true);
  });
  it('does not require labels when no calibration threshold is configured or the suite is report-only', () => {
    expect(check(report({})).passed).toBe(true);
    expect(check(report({ minJudgeAgreementRate: 0.8 }, {}, 'report-only')).passed).toBe(true);
  });
  it('shares missing-evidence failures through the complete policy evaluator', () => {
    const current = report({ minJudgeAgreementRate: 0.8 });
    const result = evaluateReportPolicy({ current });
    expect(result.gateDecision.status).toBe('failed');
    expect(result.combinedFailures.join(' ')).toMatch(/no labelled judge\/human verdict pairs/i);
  });
  it('enforces the same missing-evidence failure in the real CLI', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eval-calibration-empty-'));
    try {
      const input = path.join(directory, 'report.json');
      await writeFile(input, JSON.stringify(report({ minJudgeAgreementRate: 0.8 })));
      const result = spawnSync(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('src/cli/index.ts'), 'check', `--input=${directory}`],
        { cwd: directory, encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toMatch(/no labelled judge\/human verdict pairs/i);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
