import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  it.each<Record<string, number>>([{ minJudgeAgreementRate: 0.8 }, { maxJudgeDisagreementRate: 0.2 }, { maxAxisScoreDelta: 0.1 }])('does not skip a blocking calibration bar when its suite summary is absent (%j)', thresholds => {
    const input = report(thresholds);
    input.suites = [{ id: 'other', total: 1, passed: 1, failed: 0 }];
    input.rows = [{ id: 'other-case', suite: 'other', passed: true }];
    const result = check(input);
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toMatch(/no matching suite summary/i);
  });
  it('does not add a missing-summary gate for unconfigured or report-only manifests', () => {
    for (const input of [report({}), report({ minJudgeAgreementRate: 0.8 }, {}, 'report-only')]) {
      input.suites = [{ id: 'other', total: 1, passed: 1, failed: 0 }];
      input.rows = [{ id: 'other-case', suite: 'other', passed: true }];
      expect(check(input).passed).toBe(true);
    }
  });
  it('finds paired observations through the matched suite ID and display name', () => {
    const input = report({ minJudgeAgreementRate: 1, maxJudgeDisagreementRate: 0, maxAxisScoreDelta: 0 }, {
      judgeVerdict: false, groundTruthVerdict: false, axisScores: { accuracy: 0.7 }, groundTruthAxisScores: { accuracy: 0.7 },
    });
    input.suites[0].id = 'calibration-id'; input.suites[0].name = 'judge-calibration'; input.rows[0].suite = 'calibration-id';
    expect(check(input).passed).toBe(true);
  });
  it('does not borrow labels from another suite whose ID matches a display alias', () => {
    const input = report({ minJudgeAgreementRate: 1 });
    input.suiteManifests![0].name = 'calibration-id';
    input.suites = [{ id: 'calibration-id', name: 'Friendly calibration', total: 1, passed: 1, failed: 0 },
      { id: 'Friendly calibration', name: 'Other suite', total: 1, passed: 1, failed: 0 }];
    input.rows = [{ id: 'unlabelled', suite: 'calibration-id', passed: true },
      { id: 'other-label', suite: 'Friendly calibration', passed: true, judgeVerdict: true, groundTruthVerdict: true }];
    expect(check(input).passed).toBe(false);
  });
  it('prefers a canonical suite ID over another suite with that display name', () => {
    const input = report({ minJudgeAgreementRate: 1 });
    input.suites = [{ id: 'other-id', name: 'judge-calibration', total: 1, passed: 1, failed: 0 },
      { id: 'judge-calibration', name: 'Canonical calibration', total: 1, passed: 1, failed: 0 }];
    input.rows = [{ id: 'other-label', suite: 'other-id', passed: true, judgeVerdict: true, groundTruthVerdict: true },
      { id: 'unlabelled', suite: 'judge-calibration', passed: true }];
    expect(check(input).passed).toBe(false);
  });
  it('rejects ambiguous display-name matches instead of choosing passing evidence', () => {
    const input = report({ minJudgeAgreementRate: 1 });
    input.suites = [{ id: 'first', name: 'judge-calibration', total: 1, passed: 1, failed: 0 },
      { id: 'second', name: 'judge-calibration', total: 1, passed: 1, failed: 0 }];
    input.rows = [{ id: 'first-label', suite: 'first', passed: true, judgeVerdict: true, groundTruthVerdict: true },
      { id: 'unlabelled', suite: 'second', passed: true }];
    expect(check(input).passed).toBe(false);
  });
  it('rejects non-finite paired axis scores without masking another excessive delta', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const side of ['axisScores', 'groundTruthAxisScores'] as const) {
        const row = { axisScores: { bad: 0, excessive: 0.9 }, groundTruthAxisScores: { bad: 0, excessive: 0 } };
        row[side].bad = value;
        const result = check(report({ maxAxisScoreDelta: 0.1 }, row));
        expect(result.passed).toBe(false);
        expect(result.failures.join(' ')).toMatch(/non-finite judge\/human axis scores/i);
      }
    }
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
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)), fileURLToPath(new URL('../src/cli/index.ts', import.meta.url)), 'check', `--input=${directory}`],
        { cwd: directory, encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toMatch(/no labelled judge\/human verdict pairs/i);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
