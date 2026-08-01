import type { RunComparison } from '../history/history.js';
import { type EvalReportV1, summarizeReport } from '../model/eval-report-v1.js';

export type GateConfig = {
  minPassRate?: number;
  maxNewFailures?: number;
  zeroCritical?: boolean;
};

export type GateResult = {
  passed: boolean;
  failures: string[];
};

export const checkGates = (
  report: EvalReportV1,
  comparison: RunComparison,
  config: GateConfig,
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

  // Enforce per-suite thresholds declared in blocking suite manifests
  for (const manifest of report.suiteManifests ?? []) {
    if (manifest.gate.mode !== 'blocking') continue;

    const suiteSummary = report.suites.find((s) => s.id === manifest.name || s.name === manifest.name);
    if (!suiteSummary) continue;

    const actual = suiteSummary.total > 0 ? suiteSummary.passed / suiteSummary.total : 0;

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
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
};