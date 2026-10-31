import type { EvalReportV1 } from '../model/eval-report-v1.js';
import { analyzeComparisonCohort } from './cohort.js';
import { summarizeTelemetry } from './telemetry.js';

/** Shared portable query semantics for static reporters and future hosted APIs. */
export const analyzeRun = (current: EvalReportV1, previous?: EvalReportV1) => ({
  cohort: analyzeComparisonCohort(current, previous),
  telemetry: summarizeTelemetry(current),
});
export type RunAnalytics = ReturnType<typeof analyzeRun>;
