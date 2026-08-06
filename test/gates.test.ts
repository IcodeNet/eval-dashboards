import { describe, expect, it } from 'vitest';
import { compareRuns } from '../src/history/history.js';
import { checkGates } from '../src/gates/check-gates.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const previous: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'previous', generatedAt: '2026-07-30T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: true },
  ],
};

const current: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'current', generatedAt: '2026-07-31T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
};

describe('checkGates', () => {
  it('fails when pass rate, new failure, and critical gates are breached', () => {
    const result = checkGates(current, compareRuns(current, previous), {
      minPassRate: 0.9,
      maxNewFailures: 0,
      zeroCritical: true,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(3);
  });

  it('passes when all CLI gates are satisfied', () => {
    const result = checkGates(current, compareRuns(current, previous), {
      minPassRate: 0.4,
      maxNewFailures: 5,
      zeroCritical: false,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('supports canonical new-failure counting with scenario-category key', () => {
    const previousReport: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'previous-dedupe', generatedAt: '2026-07-30T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 3, passed: 3, failed: 0 }],
      rows: [
        { id: 'a', suite: 'quality', scenarioId: 'topic-1', category: 'groundedness', passed: true },
        { id: 'b', suite: 'quality', scenarioId: 'topic-1', category: 'groundedness', passed: true },
        { id: 'c', suite: 'quality', scenarioId: 'topic-2', category: 'groundedness', passed: true },
      ],
    };

    const currentReport: EvalReportV1 = {
      ...previousReport,
      run: { id: 'current-dedupe', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 3, passed: 0, failed: 3 }],
      rows: [
        { id: 'a', suite: 'quality', scenarioId: 'topic-1', category: 'groundedness', passed: false },
        { id: 'b', suite: 'quality', scenarioId: 'topic-1', category: 'groundedness', passed: false },
        { id: 'c', suite: 'quality', scenarioId: 'topic-2', category: 'groundedness', passed: false },
      ],
    };

    const result = checkGates(currentReport, compareRuns(currentReport, previousReport), {
      maxNewFailures: 2,
      newFailureKey: 'scenario-category',
    });

    expect(result.passed).toBe(true);
    expect(result.diagnostics.some((line) => line.includes('Canonical new-failure count'))).toBe(true);
  });

  it('fails when warning budget is exceeded', () => {
    const reportWithWarnings: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'warning-budget', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    };

    const result = checkGates(reportWithWarnings, compareRuns(reportWithWarnings, undefined), {
      maxWarnings: 2,
      maxWarningsByCode: { 'missing-kind': 0 },
      failOnWarningCodes: ['missing-severity'],
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((line) => line.includes('Lint warnings'))).toBe(true);
    expect(result.failures.some((line) => line.includes('missing-kind'))).toBe(true);
    expect(result.failures.some((line) => line.includes('missing-severity'))).toBe(true);
  });

  it('enforces required passing suites for preflight gates', () => {
    const reportWithPreflightFailure: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'preflight', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [
        { id: 'preflight', total: 1, passed: 0, failed: 1 },
        { id: 'quality', total: 1, passed: 1, failed: 0 },
      ],
      rows: [
        { id: 'probe', suite: 'preflight', passed: false, category: 'preflight', kind: 'deterministic' },
        { id: 'quality-row', suite: 'quality', passed: true, category: 'quality', kind: 'deterministic' },
      ],
    };

    const result = checkGates(reportWithPreflightFailure, compareRuns(reportWithPreflightFailure, undefined), {
      requiredPassingSuites: ['preflight'],
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/Required passing suite "preflight" has failures/);
  });

  it('enforces blocking suite manifest passRate threshold when breached', () => {
    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(reportWithManifest, compareRuns(reportWithManifest, previous), {});

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/quality.*pass rate.*blocking threshold/);
  });

  it('ignores report-only suite manifest thresholds', () => {
    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(reportWithManifest, compareRuns(reportWithManifest, previous), {});

    expect(result.passed).toBe(true);
  });

  it('passes when suite manifest threshold is met', () => {
    const passing: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'passing', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
      rows: [
        { id: 'tone', suite: 'quality', passed: true },
        { id: 'safety', suite: 'quality', passed: true },
      ],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
    };

    const result = checkGates(passing, compareRuns(passing, undefined), {});

    expect(result.passed).toBe(true);
  });

  it('fails by default when baseline compatibility is blocked', () => {
    const result = checkGates(
      current,
      compareRuns(current, previous),
      { minPassRate: 0.4, maxNewFailures: 5, zeroCritical: false },
      {
        status: 'blocked',
        issues: [
          {
            suite: 'quality',
            severity: 'blocking',
            reason: 'baseline and candidate dataset/rubric versions differ',
          },
        ],
      },
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      'Baseline compatibility is blocked due to dataset/rubric version drift.',
    );
  });

  it('allows blocked baseline when failOnBaselineBlocked is disabled', () => {
    const result = checkGates(
      current,
      compareRuns(current, previous),
      {
        minPassRate: 0.4,
        maxNewFailures: 5,
        zeroCritical: false,
        failOnBaselineBlocked: false,
      },
      {
        status: 'blocked',
        issues: [
          {
            suite: 'quality',
            severity: 'blocking',
            reason: 'baseline and candidate dataset/rubric versions differ',
          },
        ],
      },
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('enforces maxCriticalFailures threshold for blocking suites', () => {
    const result = checkGates(
      current,
      compareRuns(current, previous),
      {},
      {
        status: 'compatible',
        issues: [],
      },
    );

    expect(result.passed).toBe(true);

    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { maxCriticalFailures: 0 } },
        },
      ],
    };

    const thresholdResult = checkGates(
      reportWithManifest,
      compareRuns(reportWithManifest, previous),
      {},
      {
        status: 'compatible',
        issues: [],
      },
    );

    expect(thresholdResult.passed).toBe(false);
    expect(thresholdResult.failures[0]).toMatch(/critical failures 1 exceed blocking threshold/);
  });

  it('enforces criticalFailureRate threshold for blocking suites', () => {
    const reportWithManifest: EvalReportV1 = {
      ...current,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { criticalFailureRate: 0.4 } },
        },
      ],
    };

    const thresholdResult = checkGates(
      reportWithManifest,
      compareRuns(reportWithManifest, previous),
      {},
      {
        status: 'compatible',
        issues: [],
      },
    );

    expect(thresholdResult.passed).toBe(false);
    expect(thresholdResult.failures[0]).toMatch(/critical failure rate 0.500 exceeds blocking threshold/);
  });

  it('enforces judge disagreement rate threshold for blocking calibration suites', () => {
    const calibrationReport: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'judge-calibration', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'judge-calibration', total: 3, passed: 2, failed: 1 }],
      rows: [
        {
          id: 'case-1',
          suite: 'judge-calibration',
          passed: true,
          kind: 'llm-judge',
          judgeVerdict: true,
          groundTruthVerdict: true,
        },
        {
          id: 'case-2',
          suite: 'judge-calibration',
          passed: false,
          kind: 'llm-judge',
          judgeVerdict: false,
          groundTruthVerdict: true,
        },
        {
          id: 'case-3',
          suite: 'judge-calibration',
          passed: true,
          kind: 'llm-judge',
          judgeVerdict: false,
          groundTruthVerdict: false,
        },
      ],
      suiteManifests: [
        {
          name: 'judge-calibration',
          target: 'judge',
          datasetSource: 'manual',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'custom',
          graders: ['human-labelled-calibration'],
          gate: { mode: 'blocking', thresholds: { maxJudgeDisagreementRate: 0.2 } },
        },
      ],
    };

    const result = checkGates(calibrationReport, compareRuns(calibrationReport, undefined), {});

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/judge disagreement rate 0.333 exceeds blocking threshold/);
  });

  it('passes when judge agreement rate threshold is met for calibration suites', () => {
    const calibrationReport: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'judge-calibration-pass', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'judge-calibration', total: 4, passed: 4, failed: 0 }],
      rows: [
        { id: 'case-1', suite: 'judge-calibration', passed: true, kind: 'llm-judge', judgeVerdict: true, groundTruthVerdict: true },
        { id: 'case-2', suite: 'judge-calibration', passed: true, kind: 'llm-judge', judgeVerdict: false, groundTruthVerdict: false },
        { id: 'case-3', suite: 'judge-calibration', passed: true, kind: 'llm-judge', judgeVerdict: true, groundTruthVerdict: true },
        { id: 'case-4', suite: 'judge-calibration', passed: true, kind: 'llm-judge', judgeVerdict: false, groundTruthVerdict: false },
      ],
      suiteManifests: [
        {
          name: 'judge-calibration',
          target: 'judge',
          datasetSource: 'manual',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'custom',
          graders: ['human-labelled-calibration'],
          gate: { mode: 'blocking', thresholds: { minJudgeAgreementRate: 0.95 } },
        },
      ],
    };

    const result = checkGates(calibrationReport, compareRuns(calibrationReport, undefined), {});

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('enforces judge axis-score delta threshold for blocking calibration suites', () => {
    const calibrationReport: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: 'judge-axis-calibration', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'judge-calibration', total: 2, passed: 1, failed: 1 }],
      rows: [
        {
          id: 'case-1',
          suite: 'judge-calibration',
          passed: true,
          kind: 'llm-judge',
          judgeVerdict: true,
          groundTruthVerdict: true,
          axisScores: { groundedness: 0.9, correctness: 0.95 },
          groundTruthAxisScores: { groundedness: 0.88, correctness: 0.93 },
        },
        {
          id: 'case-2',
          suite: 'judge-calibration',
          passed: false,
          kind: 'llm-judge',
          judgeVerdict: false,
          groundTruthVerdict: true,
          axisScores: { groundedness: 0.4, correctness: 0.45 },
          groundTruthAxisScores: { groundedness: 0.9, correctness: 0.95 },
        },
      ],
      suiteManifests: [
        {
          name: 'judge-calibration',
          target: 'judge',
          datasetSource: 'manual',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'custom',
          graders: ['human-labelled-calibration'],
          gate: { mode: 'blocking', thresholds: { maxAxisScoreDelta: 0.1 } },
        },
      ],
    };

    const result = checkGates(calibrationReport, compareRuns(calibrationReport, undefined), {});

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/judge axis-score delta 0.500 exceeds blocking threshold/);
  });
});