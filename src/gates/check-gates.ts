import { comparePairedOutcomes, describePairedComparison, validatePairedComparisonOptions, type PairedComparisonOptions, type PairedOutcomeComparison } from '../analytics/paired-comparison.js';
import type { RunComparison } from '../history/history.js';
import { type EvalReportV1, summarizeReport } from '../model/eval-report-v1.js';
import type { BaselineCompatibilityResult } from '../model/eval-report-v1.js';
import { lintReportTaxonomy } from './lint-taxonomy.js';
import {
  bootstrapPassRateDelta,
  validateStatisticalGateConfig,
  type StatisticalGateConfig,
  type StatisticalGateMode,
} from './statistical.js';

export type NewFailureKeyMode =
  | 'row'
  | 'scenario'
  | 'scenario-category'
  | 'id-category';

export type SuiteGateConfig = {
  /** Minimum pass rate for this suite alone. */
  minPassRate?: number;
  /** Most rows of this suite that may newly fail against the baseline. */
  maxNewFailures?: number;
};

const SUITE_GATE_KEYS = ['minPassRate', 'maxNewFailures'] as const;

export type GateConfig = {
  /** Opt-in comparison gate over matched, version-compatible scenario/case groups. */
  paired?: PairedComparisonOptions;
  minPassRate?: number;
  /**
   * Minimum rate of rows whose outcome matched their declared
   * `expectedOutcome` (see `rowMatchedExpectation`). Prefer this over
   * `minPassRate` for suites that intentionally mix rows expected to fail
   * (e.g. an A/B harness's baseline) with rows expected to pass — a flat
   * `minPassRate` gate on such a suite blends the two into a misleading
   * number.
   */
  minMatchedExpectationRate?: number;
  maxNewFailures?: number;
  zeroCritical?: boolean;
  failOnBaselineBlocked?: boolean;
  maxWarnings?: number;
  maxWarningsByCode?: Record<string, number>;
  failOnWarningCodes?: string[];
  newFailureKey?: NewFailureKeyMode;
  requiredPassingSuites?: string[];
  /**
   * Thresholds for one suite, keyed by suite id. They apply on top of the global ones, so a suite can be held to a
   * stricter bar than the rest of the run. A suite named here that is missing from the run fails the gate.
   */
  suites?: Record<string, SuiteGateConfig>;
  /**
   * Escape hatch for 4F.6 threshold-change detection: explicitly approve a
   * loosening of thresholds relative to the recorded baseline gate config
   * (e.g. a reviewed, intentional relaxation) instead of failing the gate.
   * Detection itself still runs and is still surfaced in diagnostics/
   * `check --json-out`; this only suppresses the failure.
   */
  allowLoosening?: boolean;
  statistical?: StatisticalGateConfig;
  /**
   * 4F.23 — repeat-run gate mode: require each repeated-run row (i.e. a row
   * whose `repeated` aggregation record, from 4F.22, was populated by the
   * runner) to have passed at least `requiredPasses` out of `runs` runs.
   * Rows without a `repeated` record are unaffected by this gate and are
   * still evaluated by the existing pass-rate/threshold gates above — this
   * is an additive check, not a replacement engine.
   */
  repeat?: {
    /** Expected number of repeat runs per row. Must be a positive integer. */
    runs: number;
    /** Minimum passes required out of `runs`. Must be 0 <= requiredPasses <= runs. */
    requiredPasses: number;
  };
  calibration?: {
    /** Enable/disable pre-gate calibration evidence checks. Default: auto (on when calibration suite manifest is present). */
    enabled?: boolean;
    /** Calibration suite id used as evidence source. Default: judge-calibration. */
    suite?: string;
    /** Max calibration age in hours. Default: 168 (7 days). */
    maxAgeHours?: number;
    /**
     * Escape hatch: do not fail blocking suites when calibration evidence is
     * missing/stale/mismatched; emit diagnostics only.
     */
    allowBlockingWithoutRecentMatch?: boolean;
  };
};

/** Validate configured thresholds before they can disable enforcement through NaN or invalid ranges. */
export const validateGateConfig = (config: GateConfig): string[] => {
  const errors: string[] = [];
  for (const field of ['minPassRate', 'minMatchedExpectationRate'] as const) {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) {
      errors.push(`${field} must be a finite number between 0 and 1.`);
    }
  }
  for (const field of ['maxNewFailures', 'maxWarnings'] as const) {
    const value = config[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      errors.push(`${field} must be a non-negative integer.`);
    }
  }
  for (const [code, value] of Object.entries(config.maxWarningsByCode ?? {})) {
    if (!Number.isInteger(value) || value < 0) errors.push(`maxWarningsByCode.${code} must be a non-negative integer.`);
  }
  for (const [suite, suiteConfig] of Object.entries(config.suites ?? {})) {
    for (const key of Object.keys(suiteConfig ?? {})) {
      if (!(SUITE_GATE_KEYS as readonly string[]).includes(key)) {
        errors.push(`suites.${suite}.${key} is not a per-suite setting. Allowed: ${SUITE_GATE_KEYS.join(', ')}.`);
      }
    }
    const rate = suiteConfig?.minPassRate;
    if (rate !== undefined && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1)) {
      errors.push(`suites.${suite}.minPassRate must be a finite number between 0 and 1.`);
    }
    const budget = suiteConfig?.maxNewFailures;
    if (budget !== undefined && (!Number.isInteger(budget) || budget < 0)) {
      errors.push(`suites.${suite}.maxNewFailures must be a non-negative integer.`);
    }
  }
  errors.push(...validatePairedComparisonOptions(config.paired));
  return errors;
};

export type GateResult = {
  status?: 'passed' | 'failed' | 'inconclusive';
  pairedComparison?: PairedOutcomeComparison;
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

/**
 * Evaluate quality gates for a single eval report against configured
 * thresholds (pass-rate, severity, per-suite overrides, etc.), producing a
 * pass/fail verdict plus diagnostics (top failing categories, per-suite
 * breakdown). Used by the `check` CLI command and any programmatic caller
 * that wants gate evaluation without the CLI's I/O/exit-code plumbing.
 */
export const checkGates = (
  report: EvalReportV1,
  comparison: RunComparison,
  config: GateConfig,
  baselineCompatibility?: BaselineCompatibilityResult,
  previousReport?: EvalReportV1,
  /** Raw observations when the primary report has policy waivers applied. */
  observedCurrent?: EvalReportV1,
): GateResult => {
  const configErrors = validateGateConfig(config);
  if (configErrors.length > 0) return { passed: false, failures: configErrors, diagnostics: [] };
  const summary = summarizeReport(report);
  const failures: string[] = [];
  if (report.rows.length === 0) failures.push('No scored rows are available; an empty run cannot pass quality gates.');
  // Legacy importers may preserve repeated explicit IDs, but ambiguous case
  // identities must never count as independent passing evidence in a gate.
  for (const [label, candidate] of [['current', report], ['baseline', previousReport]] as const) {
    if (!candidate) continue;
    const identities = new Set<string>();
    for (const row of candidate.rows) {
      const identity = JSON.stringify([row.suite, row.id]);
      if (identities.has(identity)) {
        failures.push(`Row identity (${row.suite}, ${row.id}) must be unique within a gated run (${label}).`);
        break;
      }
      identities.add(identity);
    }
  }
  const diagnostics: string[] = [];
  let pairedComparison: PairedOutcomeComparison | undefined;
  let inconclusiveFailures = 0;

  if (config.minPassRate !== undefined && summary.passRate < config.minPassRate) {
    failures.push(
      `Pass rate ${summary.passRate.toFixed(3)} is below required ${config.minPassRate.toFixed(3)}.`,
    );
  }

  if (
    config.minMatchedExpectationRate !== undefined &&
    summary.matchedExpectationRate < config.minMatchedExpectationRate
  ) {
    failures.push(
      `Matched-expectation rate ${summary.matchedExpectationRate.toFixed(3)} is below required ` +
        `${config.minMatchedExpectationRate.toFixed(3)} (${summary.expectationMismatches} row(s) did not match their declared expectedOutcome).`,
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

  for (const [suiteName, suiteConfig] of Object.entries(config.suites ?? {})) {
    const suiteSummary = report.suites.find((suite) => suite.id === suiteName || suite.name === suiteName);
    if (!suiteSummary) {
      failures.push(`Suite "${suiteName}" has a threshold in gates.suites but is missing from this run.`);
      continue;
    }
    const suitePassRate = suiteSummary.total > 0 ? suiteSummary.passed / suiteSummary.total : 0;
    if (suiteConfig.minPassRate !== undefined && suitePassRate < suiteConfig.minPassRate) {
      failures.push(
        `Suite "${suiteName}" pass rate ${suitePassRate.toFixed(3)} is below required ${suiteConfig.minPassRate.toFixed(3)}.`,
      );
    }
    if (suiteConfig.maxNewFailures !== undefined) {
      const suiteNewFailures = new Set(
        comparison.newlyFailing
          .filter((row) => row.suite === suiteName)
          .map((row) => canonicalFailureKey(row.suite, row.id, row.scenarioId, row.category, newFailureKeyMode)),
      ).size;
      if (suiteNewFailures > suiteConfig.maxNewFailures) {
        failures.push(
          `Suite "${suiteName}" has ${suiteNewFailures} new failure(s), above the allowed ${suiteConfig.maxNewFailures}.`,
        );
      }
    }
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

      const isRecognizedThresholdKey =
        isPassRateKey ||
        isMaxCriticalFailuresKey ||
        isCriticalFailureRateKey ||
        isJudgeAgreementRateKey ||
        isJudgeDisagreementRateKey ||
        isAxisScoreDeltaKey;

      if (!isRecognizedThresholdKey) {
        failures.push(
          `Suite "${manifest.name}" has an unrecognized gate.thresholds key "${metric}" (blocking mode) — ` +
            'it does not match any known threshold name (passRate, maxCriticalFailures, criticalFailureRate, ' +
            'minJudgeAgreementRate, maxJudgeDisagreementRate, maxAxisScoreDelta) and would otherwise be silently ' +
            'ignored, enforcing nothing. Fix the key name or remove it.',
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

  const statistical = config.statistical;
  const statisticalMode = statistical?.mode ?? 'off';
  const statisticalConfigErrors = validateStatisticalGateConfig(statistical);
  if (statisticalConfigErrors.length > 0) {
    failures.push(
      ...statisticalConfigErrors.map((message) => `Invalid statistical gate config: ${message}`),
    );
  }
  if (statisticalMode === 'bootstrap' && statisticalConfigErrors.length === 0) {
    if (!previousReport) {
      failures.push('Statistical gating mode requires a baseline run (none selected).');
    } else {
      const currentOutcomes: number[] = report.rows.map((row) => (row.passed ? 1 : 0));
      const previousOutcomes: number[] = previousReport.rows.map((row) => (row.passed ? 1 : 0));
      const confidenceLevel = statistical?.confidenceLevel ?? 0.95;
      const bootstrapSamples = Math.max(200, Math.floor(statistical?.bootstrapSamples ?? 2000));
      const minPassRateDelta = statistical?.minPassRateDelta ?? 0;

      if (currentOutcomes.length === 0 || previousOutcomes.length === 0) {
        failures.push(
          'Statistical gating mode requires non-empty current and baseline rows to estimate pass-rate confidence.',
        );
      } else if (currentOutcomes.length !== previousOutcomes.length) {
        failures.push(
          `Statistical gating mode requires comparable row counts for current and baseline runs (current=${currentOutcomes.length}, baseline=${previousOutcomes.length}).`,
        );
      } else {
        const stats = bootstrapPassRateDelta(currentOutcomes, previousOutcomes, {
          confidenceLevel,
          bootstrapSamples,
          seedHint: `${report.run.id}:${previousReport.run.id}`,
        });

        diagnostics.push(
          `Statistical gate (bootstrap, confidence=${stats.confidenceLevel.toFixed(2)}, samples=${stats.bootstrapSamples}): observed ΔpassRate=${stats.observedDelta.toFixed(3)}, CI=[${stats.lowerBound.toFixed(3)}, ${stats.upperBound.toFixed(3)}], required min Δ=${minPassRateDelta.toFixed(3)}.`,
        );

        if (stats.upperBound < minPassRateDelta) {
          failures.push(
            `Statistical gate failed: upper confidence bound for pass-rate delta ${stats.upperBound.toFixed(3)} is below required ${minPassRateDelta.toFixed(3)}.`,
          );
        }
      }
    }
  }

  if (config.paired !== undefined) {
    if (observedCurrent && observedCurrent.run.id !== report.run.id) {
      failures.push('Raw paired evidence must refer to the same current run.');
    }
    pairedComparison = comparePairedOutcomes(observedCurrent ?? report, previousReport, config.paired);
    const description = describePairedComparison(pairedComparison);
    diagnostics.push(description);
    if (pairedComparison.status !== 'passed') {
      failures.push(description);
      if (pairedComparison.status === 'inconclusive') inconclusiveFailures += 1;
    }
  }

  if (config.repeat !== undefined) {
    const { runs, requiredPasses } = config.repeat;
    const repeatConfigErrors: string[] = [];
    if (!Number.isInteger(runs) || runs <= 0) {
      repeatConfigErrors.push('gate.repeat.runs must be a positive integer.');
    }
    if (!Number.isInteger(requiredPasses) || requiredPasses < 0) {
      repeatConfigErrors.push('gate.repeat.requiredPasses must be a non-negative integer.');
    }
    if (
      repeatConfigErrors.length === 0 &&
      Number.isInteger(runs) &&
      Number.isInteger(requiredPasses) &&
      requiredPasses > runs
    ) {
      repeatConfigErrors.push('gate.repeat.requiredPasses must not exceed gate.repeat.runs.');
    }

    if (repeatConfigErrors.length > 0) {
      failures.push(...repeatConfigErrors.map((message) => `Invalid repeat gate config: ${message}`));
    } else {
      const repeatedRows = report.rows.filter((row) => row.repeated !== undefined);
      const mismatchedRuns = repeatedRows.filter((row) => row.repeated?.runs !== runs);
      const insufficientPasses = repeatedRows.filter(
        (row) => row.repeated !== undefined && row.repeated.runs === runs && row.repeated.passes < requiredPasses,
      );

      if (repeatedRows.length > 0) {
        diagnostics.push(
          `Repeat-run gate: ${repeatedRows.length} row(s) with a repeated-run record checked against runs=${runs}, requiredPasses=${requiredPasses}.`,
        );
      }

      for (const row of mismatchedRuns) {
        failures.push(
          `Row "${row.suite}:${row.id}" repeated.runs=${row.repeated?.runs} does not match configured gate.repeat.runs=${runs}.`,
        );
      }

      for (const row of insufficientPasses) {
        failures.push(
          `Row "${row.suite}:${row.id}" passed ${row.repeated?.passes}/${row.repeated?.runs} repeat runs, below required ${requiredPasses}.`,
        );
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    diagnostics,
    ...(pairedComparison ? {
      status: failures.length === 0 ? 'passed' as const : failures.length === inconclusiveFailures ? 'inconclusive' as const : 'failed' as const,
      pairedComparison,
    } : {}),
  };
};