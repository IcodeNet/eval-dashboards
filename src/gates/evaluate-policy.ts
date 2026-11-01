import type { EvalReportV1, SuiteManifest } from '../model/eval-report-v1.js';
import { compareRuns } from '../history/history.js';
import { assessBaselineCompatibility } from '../history/baseline-compatibility.js';
import { checkGates, validateGateConfig, type GateConfig } from './check-gates.js';
import { validateStatisticalGateConfig } from './statistical.js';
import { validatePairedComparisonOptions } from '../analytics/paired-comparison.js';
import { gateDecisionFromResult } from './decision.js';
import { applyWaivers, type WaiverRegisterV1 } from './waivers.js';
import { detectGateConfigLoosening } from './threshold-change.js';
import { evaluatePrTierBudget, type PrTierBudgetConfig } from './pr-tiering.js';
import { stripControlCharacters } from '../utils/untrusted-text.js';

const CALIBRATION_DEFAULT_SUITE = 'judge-calibration';
const CALIBRATION_DEFAULT_MAX_AGE_HOURS = 168;

export type ReportPolicyOptions = {
  /** Validated current artifact; run, baseline and tier selection belong to the caller. */
  current: EvalReportV1;
  previous?: EvalReportV1;
  /** Available calibration evidence, scoped to the same project as current. Defaults to current only. */
  reports?: EvalReportV1[];
  /** Resolved policy, after the caller's config/flag overrides. */
  gateConfig?: GateConfig;
  waiverRegister?: WaiverRegisterV1;
  baselineGateConfig?: GateConfig;
  allowGateLoosening?: boolean;
  /** Optional budget for the already selected report tier; does not filter policy rows. */
  prTierBudget?: PrTierBudgetConfig;
  /** Waiver evaluation time; calibration uses the artifact timestamp when valid. */
  now?: Date;
};

/** Evaluate complete policy without file I/O, CLI parsing, notifications or publication.
 * Artifacts and registers must be validated by the caller. Preserve original observations
 * for statistical evidence even when waivers change the rows used for ordinary gates.
 */
export const evaluateReportPolicy = (options: ReportPolicyOptions) => {
  const { current, previous, waiverRegister, baselineGateConfig } = options;
  const gateConfig = options.gateConfig ?? {};
  const errors = [...validateGateConfig(gateConfig), ...validateStatisticalGateConfig(gateConfig.statistical)];
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { exitCode: 2 });
  assertValidCalibrationGateConfig(gateConfig);
  if (baselineGateConfig !== undefined) {
    const baselineErrors = validatePairedComparisonOptions(baselineGateConfig.paired);
    if (baselineErrors.length) throw Object.assign(new Error(`Invalid paired policy in baseline gate config: ${baselineErrors.join(' ')}`), { exitCode: 2 });
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw Object.assign(new Error('Policy evaluation time must be a valid Date.'), { exitCode: 2 });
  const prTierBudget = options.prTierBudget ? evaluatePrTierBudget(current, options.prTierBudget) : undefined;
  const waiverApplication = applyWaivers(current, waiverRegister, now);
  const allowGateLoosening = options.allowGateLoosening === true || gateConfig.allowLoosening === true;
  const thresholdChangeResult = baselineGateConfig === undefined ? undefined : detectGateConfigLoosening(baselineGateConfig, gateConfig);
  const gateResult = checkGates(
    waiverApplication.reportForGating,
    compareRuns(waiverApplication.reportForGating, previous),
    gateConfig,
    assessBaselineCompatibility(current.suiteManifests, previous?.suiteManifests, previous !== undefined),
    previous,
    current,
  );
  const calibrationChecks = evaluateCalibrationChecks(options.reports ?? [current], current, gateConfig, now);
  const thresholdChangeFailures = thresholdChangeResult?.loosened && !allowGateLoosening ? thresholdChangeResult.failures : [];
  const combinedFailures = [
    ...gateResult.failures, ...calibrationChecks.failures, ...waiverApplication.failures,
    ...thresholdChangeFailures, ...(prTierBudget?.failures ?? []),
  ].map(stripControlCharacters);
  const combinedDiagnostics = [
    ...waiverApplication.diagnostics, ...gateResult.diagnostics, ...calibrationChecks.diagnostics,
    ...(thresholdChangeResult?.diagnostics ?? []),
    ...(thresholdChangeResult?.loosened && allowGateLoosening
      ? ['Gate configuration loosening detected but explicitly allowed via --allow-gate-loosening.'] : []),
    ...(prTierBudget?.diagnostics ?? []),
  ].map(stripControlCharacters);
  const gatePassed = combinedFailures.length === 0;
  const gateDecision = gateDecisionFromResult({
    passed: gatePassed,
    status: gateResult.status === 'inconclusive' && combinedFailures.length === gateResult.failures.length ? 'inconclusive' : gatePassed ? 'passed' : 'failed',
    pairedComparison: gateResult.pairedComparison,
    failures: combinedFailures,
    diagnostics: combinedDiagnostics,
  });
  return { gateDecision, gateConfig, prTierBudget, waiverApplication, thresholdChangeResult,
    allowGateLoosening, gatePassed, combinedFailures, combinedDiagnostics };
};

export type ReportPolicyResult = ReturnType<typeof evaluateReportPolicy>;

type CalibrationCheckResult = {
  failures: string[];
  diagnostics: string[];
};

const isJudgeScoredSuite = (manifest: SuiteManifest): boolean =>
  manifest.graders.includes('llm-judge') || manifest.graders.includes('human-labelled-calibration');

const evaluateCalibrationChecks = (
  reports: EvalReportV1[],
  current: EvalReportV1,
  gateConfig: GateConfig,
  now: Date,
): CalibrationCheckResult => {
  const failures: string[] = [];
  const diagnostics: string[] = [];

  const calibrationConfig = gateConfig.calibration ?? {};
  if (calibrationConfig.enabled === false) {
    return { failures, diagnostics };
  }

  const suiteId = calibrationConfig.suite ?? CALIBRATION_DEFAULT_SUITE;
  const maxAgeHours = calibrationConfig.maxAgeHours ?? CALIBRATION_DEFAULT_MAX_AGE_HOURS;
  const allowBlockingWithoutRecentMatch = calibrationConfig.allowBlockingWithoutRecentMatch === true;
  if (!current.suiteManifests?.length) {
    return { failures, diagnostics };
  }

  const targetSuites = current.suiteManifests.filter(
    (manifest) => manifest.name !== suiteId && isJudgeScoredSuite(manifest),
  );
  if (targetSuites.length === 0) {
    return { failures, diagnostics };
  }

  const calibrationConfigured = current.suiteManifests.some((manifest) => manifest.name === suiteId);
  const forceEnabled = calibrationConfig.enabled === true;
  if (!calibrationConfigured && !forceEnabled) {
    return { failures, diagnostics };
  }

  const expectedCalibrationRubricVersion =
    current.suiteManifests.find((manifest) => manifest.name === suiteId)?.rubricVersion ??
    current.rubricContracts?.find((contract) => contract.suiteName === suiteId)?.rubricVersion;

  if (calibrationConfigured && expectedCalibrationRubricVersion === undefined) {
    throw Object.assign(
      new Error(
        `Invalid calibration gate config: calibration suite "${suiteId}" requires rubric metadata ` +
          '(suite manifest or rubric contract) in the current artifact.',
      ),
      { exitCode: 2 },
    );
  }

  const nowMs = Number.isFinite(Date.parse(current.run.generatedAt))
    ? Date.parse(current.run.generatedAt)
    : now.getTime();
  const cutoffMs = nowMs - maxAgeHours * 60 * 60 * 1000;

  const evidenceRuns = reports.filter((report) => {
    const generatedAtMs = Date.parse(report.run.generatedAt);
    if (!Number.isFinite(generatedAtMs)) {
      return false;
    }
    return generatedAtMs >= cutoffMs && generatedAtMs <= nowMs;
  });

  for (const manifest of targetSuites) {
    const suiteRows = current.rows.filter((row) => row.suite === manifest.name);
    const judgeModels = [...new Set(suiteRows.map((row) => row.judgeModel).filter((value): value is string => typeof value === 'string' && value.length > 0))];

    if (judgeModels.length === 0) {
      const issue =
        `Calibration preflight: suite "${manifest.name}" has no judgeModel values in current rows; ` +
        'calibration evidence cannot be matched.';
      if (manifest.gate.mode === 'blocking' && !allowBlockingWithoutRecentMatch) {
        failures.push(issue);
      } else {
        diagnostics.push(`${issue} (warning-only)`);
      }
      continue;
    }

    for (const judgeModel of judgeModels) {
      const evidenceCandidates =
        manifest.gate.mode === 'blocking'
          ? evidenceRuns.filter((report) => report.run.id !== current.run.id)
          : evidenceRuns;

      const hasRecentMatch = evidenceCandidates.some((report) => {
        const calibrationManifest = report.suiteManifests?.find((candidate) => candidate.name === suiteId);
        if (!calibrationManifest) {
          return false;
        }

        const calibrationRubricVersion =
          calibrationManifest.rubricVersion ??
          report.rubricContracts?.find((contract) => contract.suiteName === suiteId)?.rubricVersion;
        if (
          expectedCalibrationRubricVersion !== undefined &&
          calibrationRubricVersion !== expectedCalibrationRubricVersion
        ) {
          return false;
        }

        return report.rows.some(
          (row) =>
            row.suite === suiteId &&
            row.judgeModel === judgeModel &&
            row.groundTruthVerdict !== undefined,
        );
      });

      if (hasRecentMatch) {
        continue;
      }

      const issue =
        `Calibration preflight: suite "${manifest.name}" requires recent "${suiteId}" evidence ` +
        `(judgeModel="${judgeModel}", calibrationRubricVersion="${expectedCalibrationRubricVersion ?? 'n/a'}", maxAgeHours=${maxAgeHours}) ` +
        'but no matching calibration run was found.';

      if (manifest.gate.mode === 'blocking' && !allowBlockingWithoutRecentMatch) {
        failures.push(issue);
      } else {
        diagnostics.push(`${issue} (warning-only)`);
      }
    }
  }

  return { failures, diagnostics };
};

export const assertValidCalibrationGateConfig = (gateConfig: GateConfig): void => {
  const calibration = gateConfig.calibration;
  if (!calibration) {
    return;
  }

  if (calibration.maxAgeHours !== undefined) {
    const maxAgeHours = Number(calibration.maxAgeHours);
    if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
      throw Object.assign(
        new Error('Invalid calibration gate config: maxAgeHours must be a finite number greater than 0.'),
        { exitCode: 2 },
      );
    }
  }
};
