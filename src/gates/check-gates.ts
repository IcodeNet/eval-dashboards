import type { RunComparison } from '../history/history.js';
import { type EvalReportV1, summarizeReport } from '../model/eval-report-v1.js';
import type { BaselineCompatibilityResult } from '../model/eval-report-v1.js';

export type GateConfig = {
  minPassRate?: number;
  maxNewFailures?: number;
  zeroCritical?: boolean;
  failOnBaselineBlocked?: boolean;
};

export type GateResult = {
  passed: boolean;
  failures: string[];
};

export const checkGates = (
  report: EvalReportV1,
  comparison: RunComparison,
  config: GateConfig,
  baselineCompatibility?: BaselineCompatibilityResult,
): GateResult => {
  const summary = summarizeReport(report);
  const failures: string[] = [];

  if (config.minPassRate !== undefined && summary.passRate < config.minPassRate) {
    failures.push(
      `Pass rate ${summary.passRate.toFixed(3)} is below required ${config.minPassRate.toFixed(3)}.`,
    );
  }

  if (
    config.maxNewFailures !== undefined &&
    comparison.newlyFailing.length > config.maxNewFailures
  ) {
    failures.push(
      `New failures ${comparison.newlyFailing.length} exceed allowed ${config.maxNewFailures}.`,
    );
  }

  if (config.zeroCritical === true && summary.severityCounts.critical > 0) {
    failures.push(`Critical failures ${summary.severityCounts.critical} exceed allowed 0.`);
  }

  const shouldFailOnBlockedBaseline = config.failOnBaselineBlocked !== false;
  if (shouldFailOnBlockedBaseline && baselineCompatibility?.status === 'blocked') {
    failures.push('Baseline compatibility is blocked due to dataset/rubric version drift.');
  }

  // Enforce per-suite thresholds declared in blocking suite manifests
  for (const manifest of report.suiteManifests ?? []) {
    if (manifest.gate.mode !== 'blocking') continue;

    const suiteSummary = report.suites.find((s) => s.id === manifest.name || s.name === manifest.name);
    if (!suiteSummary) continue;

    const actual = suiteSummary.total > 0 ? suiteSummary.passed / suiteSummary.total : 0;
    const suiteRows = report.rows.filter((row) => row.suite === manifest.name);
    const calibrationRows = suiteRows.filter(
      (row) => row.judgeVerdict !== undefined && row.groundTruthVerdict !== undefined,
    );
    const calibrationDisagreements = calibrationRows.filter(
      (row) => row.judgeVerdict !== row.groundTruthVerdict,
    ).length;
    const calibrationAgreementRate =
      calibrationRows.length > 0
        ? (calibrationRows.length - calibrationDisagreements) / calibrationRows.length
        : 1;
    const calibrationDisagreementRate =
      calibrationRows.length > 0 ? calibrationDisagreements / calibrationRows.length : 0;
    const calibrationAxisRows = suiteRows.filter(
      (row) => row.axisScores !== undefined && row.groundTruthAxisScores !== undefined,
    );
    const calibrationAxisDeltas = calibrationAxisRows.flatMap((row) =>
      Object.entries(row.axisScores ?? {}).flatMap(([axis, score]) => {
        const groundTruthScore = row.groundTruthAxisScores?.[axis];
        if (groundTruthScore === undefined) return [];
        return [Math.abs(score - groundTruthScore)];
      }),
    );
    const calibrationAxisDelta =
      calibrationAxisDeltas.length > 0
        ? Math.max(...calibrationAxisDeltas)
        : 0;
    const criticalFailures = suiteRows.filter(
      (row) => !row.passed && row.severity === 'critical',
    ).length;
    const criticalFailureRate = suiteSummary.total > 0 ? criticalFailures / suiteSummary.total : 0;

    for (const [metric, threshold] of Object.entries(manifest.gate.thresholds)) {
      // Map well-known threshold keys to the suite pass rate; unknown keys are skipped
      const isPassRateKey =
        metric === 'passRate' ||
        metric.toLowerCase().includes('passrate') ||
        metric.toLowerCase().includes('pass_rate');

      if (isPassRateKey && actual < threshold) {
        failures.push(
          `Suite "${manifest.name}" pass rate ${actual.toFixed(3)} is below blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }

      const normalizedMetric = metric.toLowerCase();
      const isMaxCriticalFailuresKey =
        normalizedMetric === 'maxcriticalfailures' ||
        normalizedMetric === 'max_critical_failures' ||
        normalizedMetric === 'max-critical-failures';

      if (isMaxCriticalFailuresKey && criticalFailures > threshold) {
        failures.push(
          `Suite "${manifest.name}" critical failures ${criticalFailures} exceed blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }

      const isCriticalFailureRateKey =
        normalizedMetric === 'criticalfailurerate' ||
        normalizedMetric === 'critical_failure_rate' ||
        normalizedMetric === 'critical-failure-rate';

      if (isCriticalFailureRateKey && criticalFailureRate > threshold) {
        failures.push(
          `Suite "${manifest.name}" critical failure rate ${criticalFailureRate.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }

      const isJudgeAgreementRateKey =
        normalizedMetric === 'minjudgeagreementrate' ||
        normalizedMetric === 'min_judge_agreement_rate' ||
        normalizedMetric === 'min-judge-agreement-rate' ||
        normalizedMetric === 'judgeagreementrate' ||
        normalizedMetric === 'judge_agreement_rate' ||
        normalizedMetric === 'judge-agreement-rate';

      if (isJudgeAgreementRateKey && calibrationAgreementRate < threshold) {
        failures.push(
          `Suite "${manifest.name}" judge agreement rate ${calibrationAgreementRate.toFixed(3)} is below blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }

      const isJudgeDisagreementRateKey =
        normalizedMetric === 'maxjudgedisagreementrate' ||
        normalizedMetric === 'max_judge_disagreement_rate' ||
        normalizedMetric === 'max-judge-disagreement-rate' ||
        normalizedMetric === 'judgedisagreementrate' ||
        normalizedMetric === 'judge_disagreement_rate' ||
        normalizedMetric === 'judge-disagreement-rate';

      if (isJudgeDisagreementRateKey && calibrationDisagreementRate > threshold) {
        failures.push(
          `Suite "${manifest.name}" judge disagreement rate ${calibrationDisagreementRate.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }

      const isAxisScoreDeltaKey =
        normalizedMetric === 'maxaxisscoredelta' ||
        normalizedMetric === 'max_axis_score_delta' ||
        normalizedMetric === 'max-axis-score-delta' ||
        normalizedMetric === 'axisdeltatolerance' ||
        normalizedMetric === 'axis_delta_tolerance' ||
        normalizedMetric === 'axis-delta-tolerance';

      if (isAxisScoreDeltaKey && calibrationAxisDelta > threshold) {
        failures.push(
          `Suite "${manifest.name}" judge axis-score delta ${calibrationAxisDelta.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`,
        );
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
};