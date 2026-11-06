import { describe, expect, it } from 'vitest';
import { checkGates, compareRuns, evaluateReportPolicy, validateEvalReport, type EvalReportV1 } from '../src/index.js';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const report = (count = 2, minimum = 2): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'calibration', generatedAt: '2026-11-06T11:00:00Z', kind: 'calibration' },
  suites: [{ id: 'judge-calibration', total: count, passed: count, failed: 0 }],
  rows: Array.from({ length: count }, (_, i) => ({ id: `label-${i}`, suite: 'judge-calibration', passed: true,
    judgeModel: 'judge-a', judgeVerdict: i % 2 === 0, groundTruthVerdict: i % 2 === 0 })),
  suiteManifests: [{ name: 'judge-calibration', target: 'judge', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1',
    graders: ['human-labelled-calibration'], riskArea: 'response-quality',
    gate: { mode: 'blocking', thresholds: { minJudgeAgreementRate: 1, minCalibrationRows: minimum } } }],
});
const check = (input: EvalReportV1) => checkGates(input, compareRuns(input), {});

describe('minimum calibration sample', () => {
  it.each([2, 3])('accepts %i paired labels against a minimum of two', count => {
    expect(check(report(count)).passed).toBe(true);
  });
  it.each([0, 1])('rejects %i paired labels with an explicit observed-count diagnostic', count => {
    const result = check(report(count));
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain(`labelled judge/human verdict pairs ${count} are below blocking threshold minCalibrationRows=2`);
  });
  it('does not count unlabelled or one-sided rows', () => {
    const input = report(4); delete input.rows[1].judgeVerdict; delete input.rows[2].groundTruthVerdict;
    delete input.rows[3].judgeVerdict; delete input.rows[3].groundTruthVerdict;
    expect(check(input).failures.join(' ')).toContain('verdict pairs 1 are below');
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid minimum %s', minimum => {
    expect(check(report(2, minimum)).failures.join(' ')).toContain('minCalibrationRows must be a positive safe integer');
  });
  it.each(['min_calibration_rows', 'min-calibration-rows'])('accepts the %s alias', key => {
    const input = report(); delete input.suiteManifests![0].gate.thresholds.minCalibrationRows;
    input.suiteManifests![0].gate.thresholds[key] = 2;
    expect(check(input).passed).toBe(true);
  });
  it('does not add a sample requirement when omitted or enforce report-only manifest bars', () => {
    const input = report(1); delete input.suiteManifests![0].gate.thresholds.minCalibrationRows;
    expect(check(input).passed).toBe(true);
    input.suiteManifests![0].gate = { mode: 'report-only', thresholds: { minCalibrationRows: 100 } };
    expect(check(input).passed).toBe(true);
  });
  it('cannot turn duplicate row identities into sufficient independent observations', () => {
    const input = report(); input.rows[1].id = input.rows[0].id;
    expect(check(input).failures.join(' ')).toContain('must be unique');
  });
  it('applies the floor separately to the relevant judge in calibration preflight', () => {
    const evidence = report(3); evidence.suiteManifests![0].gate.mode = 'report-only';
    const current: EvalReportV1 = { ...structuredClone(evidence), run: { id: 'current', generatedAt: '2026-11-06T12:00:00Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'case', suite: 'quality', passed: true, judgeModel: 'judge-a' }],
      suiteManifests: [{ ...evidence.suiteManifests![0], name: 'quality', graders: ['llm-judge'], gate: { mode: 'blocking', thresholds: {} } }],
    };
    const evaluate = () => evaluateReportPolicy({ current, reports: [evidence, current], gateConfig: { calibration: { enabled: true } } });
    expect(evaluate().gatePassed).toBe(true);
    evidence.rows[1].judgeModel = 'judge-b'; evidence.rows[2].judgeModel = 'judge-b';
    expect(evaluate().gatePassed).toBe(false);
  });
  it('validates the runnable example and enforces its threshold in the real CLI', async () => {
    const example = new URL('../examples/calibration-minimum-sample/eval-report.json', import.meta.url);
    const input = JSON.parse(await readFile(example, 'utf8')) as EvalReportV1;
    expect(validateEvalReport(input).ok).toBe(true);
    expect(check(input).passed).toBe(true);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      fileURLToPath(new URL('../src/cli/index.ts', import.meta.url)), 'check', `--input=${fileURLToPath(new URL('.', example))}`],
    { encoding: 'utf8', timeout: 30_000 });
    expect(result.status, result.stderr).toBe(0);
    delete input.rows[1].groundTruthVerdict;
    expect(check(input).failures.join(' ')).toContain('verdict pairs 1 are below');
  });
});
