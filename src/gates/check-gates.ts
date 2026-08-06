import type { RunComparison } from '../history/history.js';
import { type EvalReportV1, summarizeReport } from '../model/eval-report-v1.js';
import type { BaselineCompatibilityResult } from '../model/eval-report-v1.js';
import { lintReportTaxonomy } from './lint-taxonomy.js';

export type NewFailureKeyMode =
  | 'row'
  | 'scenario'
  | 'scenario-category'
  | 'id-category';

export type GateConfig = {
  minPassRate?: number;
  maxNewFailures?: number;
  zeroCritical?: boolean;
  failOnBaselineBlocked?: boolean;
  maxWarnings?: number;
  maxWarningsByCode?: Record<string, number>;
  failOnWarningCodes?: string[];
  newFailureKey?: NewFailureKeyMode;
  requiredPassingSuites?: string[];
};

export type GateResult = {
  passed: boolean;
  failures: string[];
  diagnostics: string[];
};

const canonicalFailureKey = (
  suite: string,
  id: string,
  scenarioId: string | undefined,
  category: string | undefined,
  mode: NewFailureKeyMode,
): string => {
  if (mode === 'scenario' && scenarioId) return `${suite}:${scenarioId}`;
  if (mode === 'scenario-category' && scenarioId) {
    return `${suite}:${scenarioId}:${category ?? 'uncategorized'}`;
  }
  if (mode === 'id-category') {
    return `${suite}:${id}:${category ?? 'uncategorized'}`;
  }
  return `${suite}:${id}`;
};

const warningCountByCode = (codes: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
};

const topFailureReasons = (report: EvalReportV1): string[] => {
  const buckets = new Map<string, number>();
  for (const row of report.rows) {
    if (row.passed) continue;
    const key = row.category ?? row.reason ?? 'uncategorized';
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason, count]) => `${reason}=${count}`);
};

export const checkGates = (
  report: EvalReportV1,
  comparison: RunComparison,
  config: GateConfig,
  baselineCompatibility?: BaselineCompatibilityResult,
): GateResult => {
  const summary = summarizeReport(report);
  const failures: string[] = [];
  const diagnostics: string[] = [];

  if (config.minPassRate !== undefined && summary.passRate < config.minPassRate) {
    failures.push(
      `Pass rate ${summary.passRate.toFixed(3)} is below required ${config.minPassRate.toFixed(3)}.`,
    );
  }

  const newFailureKeyMode = config.newFailureKey ?? 'row';
  const canonicalNewFailureKeys = new Set(
    comparison.newlyFailing.map((row) =>
      canonicalFailureKey(row.suite, row.id, row.scenarioId, row.category, newFailureKeyMode),
    ),
  );
  const canonicalNewFailureCount = canonicalNewFailureKeys.size;

  if (config.maxNewFailures !== undefined && canonicalNewFailureCount > config.maxNewFailures) {
    failures.push(
      `New failures ${canonicalNewFailureCount} exceed allowed ${config.maxNewFailures} (key=${newFailureKeyMode}, raw=${comparison.newlyFailing.length}).`,
    );
  }

  if (comparison.newlyFailing.length > 0 && newFailureKeyMode !== 'row') {
    diagnostics.push(
      `Canonical new-failure count (${newFailureKeyMode}) ${canonicalNewFailureCount} from ${comparison.newlyFailing.length} raw rows.`,
    );
  }

  if (config.zeroCritical === true && summary.severityCounts.critical > 0) {
    failures.push(`Critical failures ${summary.severityCounts.critical} exceed allowed 0.`);
  }

  const shouldFailOnBlockedBaseline = config.failOnBaselineBlocked !== false;
  if (shouldFailOnBlockedBaseline && baselineCompatibility?.status === 'blocked') {
    failures.push('Baseline compatibility is blocked due to dataset/rubric version drift.');
  }

  const requiredPassingSuites = config.requiredPassingSuites ?? [];
  for (const suiteName of requiredPassingSuites) {
    const suiteSummary = report.suites.find((suite) => suite.id === suiteName || suite.name === suiteName);
    if (!suiteSummary) {
      failures.push(`Required passing suite "${suiteName}" is missing from this run.`);
      continue;
    }

    if (suiteSummary.failed > 0) {
      failures.push(
        `Required passing suite "${suiteName}" has failures (${suiteSummary.failed}/${suiteSummary.total}).`,
      );
    }
  }

  const lintWarnings = lintReportTaxonomy(report).issues.filter((issue) => issue.level === 'warning');
  const lintWarningCodes = lintWarnings.map((issue) => issue.code);
  const lintWarningCounts = warningCountByCode(lintWarningCodes);

  if (config.maxWarnings !== undefined && lintWarnings.length > config.maxWarnings) {
    failures.push(
      `Lint warnings ${lintWarnings.length} exceed allowed ${config.maxWarnings}.`,
    );
  }

  for (const [code, maxAllowed] of Object.entries(config.maxWarningsByCode ?? {})) {
    const actual = lintWarningCounts.get(code) ?? 0;
    if (actual > maxAllowed) {
      failures.push(`Lint warning code ${code} count ${actual} exceeds allowed ${maxAllowed}.`);
    }
  }

  for (const code of config.failOnWarningCodes ?? []) {
    const actual = lintWarningCounts.get(code) ?? 0;
    if (actual > 0) {
      failures.push(`Lint warning code ${code} is configured as fail-on-warning and appeared ${actual} time(s).`);
    }
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

  const reasonBreakdown = topFailureReasons(report);
  if (reasonBreakdown.length > 0) {
    diagnostics.push(`Top failing categories: ${reasonBreakdown.join(', ')}`);
  }

  if (lintWarnings.length > 0) {
    const warningBreakdown = [...lintWarningCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([code, count]) => `${code}=${count}`)
      .join(', ');
    diagnostics.push(`Lint warning breakdown: ${warningBreakdown}`);
  }

  return {
    passed: failures.length === 0,
    failures,
    diagnostics,
  };
};