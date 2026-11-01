import type { EvalReportV1, EvalRow } from '../model/eval-report-v1.js';
import { buildMatchedCohort, caseIdentity } from './cohort.js';

export type TrialRateEstimate = {
  status: 'estimated' | 'unknown';
  runs?: number;
  matchedExpectations?: number;
  observedRate?: number;
  interval?: { lower: number; upper: number };
  reason?: 'missing-repeats' | 'invalid-counts' | 'sampling-design-unknown' | 'duplicate-identity';
};
export type RepeatedTrialCase = {
  suite: string;
  id: string;
  current: TrialRateEstimate;
  previous?: TrialRateEstimate;
  comparison: {
    status: 'estimated' | 'unknown' | 'not-compared';
    observedDelta?: number;
    interval?: { lower: number; upper: number };
    reason?: string;
  };
};
export type RepeatedTrialSummary = {
  method: 'hoeffding-union-bound';
  metric: 'within-case-matched-expectation-rate';
  confidenceLevel: number;
  currentCases: number;
  estimatedCases: number;
  unknownCases: number;
  estimatedComparisons: number;
  unavailableComparisons: number;
  caseCount: number;
  cases: RepeatedTrialCase[];
};

// Bernoulli trials lie in [0, 1]. This is a per-case fixed-sample bound;
// no independence across cases or across the two runs is claimed.
const bound = (rate: number, runs: number, alpha: number) => {
  const width = Math.sqrt(Math.log(2 / alpha) / (2 * runs));
  return { lower: Math.max(0, rate - width), upper: Math.min(1, rate + width) };
};
const estimate = (row: EvalRow, alpha: number, duplicate: boolean): TrialRateEstimate => {
  if (duplicate) return { status: 'unknown', reason: 'duplicate-identity' };
  const repeated = row.repeated;
  if (!repeated) return { status: 'unknown', reason: 'missing-repeats' };
  const { runs, passes } = repeated;
  if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(passes) || passes < 0 || passes > runs) {
    return { status: 'unknown', reason: 'invalid-counts' };
  }
  const matchedExpectations = row.expectedOutcome === 'fail' ? runs - passes : passes;
  const observedRate = matchedExpectations / runs;
  const observations = { runs, matchedExpectations, observedRate };
  if (repeated.samplingDesign !== 'fixed-independent') return { ...observations, status: 'unknown', reason: 'sampling-design-unknown' };
  return { ...observations, status: 'estimated', interval: bound(observedRate, runs, alpha) };
};

/** Per-case trial evidence, separate from case-group comparisons and release verdicts. */
export const summarizeRepeatedTrials = (current: EvalReportV1, previous?: EvalReportV1, confidenceLevel = 0.95): RepeatedTrialSummary => {
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) throw new Error('Repeated-trial confidenceLevel must be between 0 and 1.');
  const alpha = 1 - confidenceLevel;
  const index = (report: EvalReportV1) => {
    const result = new Map<string, EvalRow[]>();
    for (const row of report.rows) { const key = caseIdentity(row); const rows = result.get(key) ?? []; rows.push(row); result.set(key, rows); }
    return result;
  };
  const currentRows = index(current), previousRows = previous ? index(previous) : new Map<string, EvalRow[]>();
  const pairs = new Map(buildMatchedCohort(current, previous).pairs.map(pair => [caseIdentity(pair.current), pair]));
  const result: RepeatedTrialSummary = { method: 'hoeffding-union-bound', metric: 'within-case-matched-expectation-rate', confidenceLevel,
    currentCases: 0, estimatedCases: 0, unknownCases: 0, estimatedComparisons: 0, unavailableComparisons: 0, caseCount: 0, cases: [] };
  for (const key of [...currentRows.keys()].sort()) {
    const rows = currentRows.get(key)!;
    if (!rows.some(row => row.repeated !== undefined)) continue;
    result.currentCases += 1;
    const row = rows[0], oldRows = previousRows.get(key) ?? [], old = oldRows[0];
    const currentEstimate = estimate(row, alpha, rows.length !== 1);
    const previousEstimate = old ? estimate(old, alpha, oldRows.length !== 1) : undefined;
    if (currentEstimate.status === 'estimated') result.estimatedCases += 1;
    else result.unknownCases += 1;
    const entry: RepeatedTrialCase = { suite: row.suite, id: row.id, current: currentEstimate, previous: previousEstimate,
      comparison: { status: previous ? 'unknown' : 'not-compared' } };
    const pair = pairs.get(key);
    if (previous) {
      if (!pair?.eligible) entry.comparison.reason = 'matching-compatible-case-required';
      else if (row.datasetId !== old?.datasetId || row.scenarioId !== old?.scenarioId) entry.comparison.reason = 'case-grouping-changed';
      else if (currentEstimate.status !== 'estimated' || previousEstimate?.status !== 'estimated') entry.comparison.reason = 'both-sampling-designs-required';
      else {
        // Allocate half the error probability to each run. The union bound
        // remains valid when the two runs are dependent; no trial pairing exists.
        const now = estimate(row, alpha / 2, false), before = estimate(old!, alpha / 2, false);
        entry.comparison = { status: 'estimated', observedDelta: now.observedRate! - before.observedRate!, interval: {
          lower: Math.max(-1, now.interval!.lower - before.interval!.upper),
          upper: Math.min(1, now.interval!.upper - before.interval!.lower),
        } };
      }
      if (entry.comparison.status === 'estimated') result.estimatedComparisons += 1;
      else result.unavailableComparisons += 1;
    }
    result.caseCount += 1;
    if (result.cases.length < 20) result.cases.push(entry);
  }
  return result;
};

export const describeRepeatedTrials = (summary: RepeatedTrialSummary): string =>
  `Repeated trials: ${summary.estimatedCases}/${summary.currentCases} cases have ${Number((summary.confidenceLevel * 100).toPrecision(6))}% rate intervals; ${summary.unknownCases} unknown; ${summary.estimatedComparisons} change interval${summary.estimatedComparisons === 1 ? '' : 's'}. Trials are not pooled across cases.`;

const reasonDescriptions: Record<string, string> = {
  'missing-repeats': 'trial counts are missing',
  'invalid-counts': 'trial counts are invalid or unsafe',
  'sampling-design-unknown': 'sampling design was not declared',
  'duplicate-identity': 'case ID is duplicated',
  'matching-compatible-case-required': 'a matching case with compatible measurement versions is required',
  'case-grouping-changed': 'dataset or scenario grouping changed',
  'both-sampling-designs-required': 'fixed independent sampling must be declared in both runs',
};
export const describeTrialReason = (reason: string | undefined): string => Object.hasOwn(reasonDescriptions, reason ?? '')
  ? reasonDescriptions[reason ?? '']! : 'evidence is unavailable';

const conciseNumber = (value: number): number => Number(value.toPrecision(6));
export const formatTrialRate = (estimate: TrialRateEstimate): string => estimate.observedRate === undefined
  ? 'unknown' : `${conciseNumber(estimate.observedRate)} (${estimate.matchedExpectations}/${estimate.runs} matched)`;
export const formatTrialInterval = (interval: { lower: number; upper: number }): string =>
  `[${conciseNumber(interval.lower)}, ${conciseNumber(interval.upper)}]`;
export const formatTrialBaseline = (entry: RepeatedTrialCase): string => entry.previous
  ? formatTrialRate(entry.previous) : entry.comparison.status === 'not-compared' ? 'not compared' : 'unavailable';
export const formatTrialChange = (entry: RepeatedTrialCase): string => entry.comparison.interval
  ? `delta ${conciseNumber(entry.comparison.observedDelta!)} ${formatTrialInterval(entry.comparison.interval)}`
  : `${entry.comparison.status}${entry.comparison.reason ? ` (${describeTrialReason(entry.comparison.reason)})` : ''}`;
export const describeRepeatedTrialCase = (entry: RepeatedTrialCase): string => {
  const interval = entry.current.interval ? formatTrialInterval(entry.current.interval) : `unknown (${describeTrialReason(entry.current.reason)})`;
  return `${entry.suite}/${entry.id}: observed rate ${formatTrialRate(entry.current)}; interval ${interval}; baseline ${formatTrialBaseline(entry)}; comparison ${formatTrialChange(entry)}.`;
};
