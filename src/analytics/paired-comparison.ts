import { rowMatchedExpectation, type EvalReportV1 } from '../model/eval-report-v1.js';
import { buildMatchedCohort } from './cohort.js';

export type PairedComparisonOptions = {
  confidenceLevel?: number;
  minDelta?: number;
  minClusters?: number;
  /** A declared assumption, not something inferred from distinct row IDs. */
  independentClusters?: boolean;
};
export type PairedOutcomeComparison = {
  status: 'passed' | 'failed' | 'inconclusive';
  method: 'paired-hoeffding';
  metric: 'cluster-mean-matched-expectation-rate-delta';
  samplingUnit: 'declared-scenario-or-case';
  currentRunId: string;
  previousRunId?: string;
  confidenceLevel: number;
  minDelta: number;
  minClusters: number;
  independentClusters: boolean;
  matchedCases: number;
  eligibleCases: number;
  clusters: number;
  repeatedCases: number;
  observedCurrentRate?: number;
  observedPreviousRate?: number;
  observedDelta?: number;
  interval?: { lower: number; upper: number };
  reasons: string[];
};

export const validatePairedComparisonOptions = (options?: PairedComparisonOptions): string[] => {
  if (options === undefined) return [];
  if (!options || typeof options !== 'object' || Array.isArray(options)) return ['paired must be an object.'];
  const errors: string[] = [];
  if (options.confidenceLevel !== undefined && (!Number.isFinite(options.confidenceLevel) || options.confidenceLevel <= 0 || options.confidenceLevel >= 1)) {
    errors.push('paired.confidenceLevel must be a finite number between 0 and 1 (exclusive).');
  }
  if (options.minDelta !== undefined && (!Number.isFinite(options.minDelta) || options.minDelta < -1 || options.minDelta > 1)) {
    errors.push('paired.minDelta must be a finite number between -1 and 1.');
  }
  if (options.minClusters !== undefined && (!Number.isSafeInteger(options.minClusters) || options.minClusters < 2)) {
    errors.push('paired.minClusters must be a safe integer of at least 2.');
  }
  if (options.independentClusters !== undefined && typeof options.independentClusters !== 'boolean') errors.push('paired.independentClusters must be a boolean.');
  return errors;
};

/**
 * Pair observations before aggregation, then give each declared scenario equal weight.
 * A repeat aggregate is one observation: repeated.runs never increases the sample size.
 * The two-sided Hoeffding bound for independent cluster deltas in [-1, 1] has
 * half-width sqrt(2 * log(2 / alpha) / n). Unlike a percentile bootstrap, it
 * does not collapse to perfect certainty when observed deltas are all equal.
 * Independence and representative sampling are external assumptions, not proven by this API.
 */
export const comparePairedOutcomes = (current: EvalReportV1, previous?: EvalReportV1, options: PairedComparisonOptions = {}): PairedOutcomeComparison => {
  const errors = validatePairedComparisonOptions(options);
  if (errors.length) throw new RangeError(errors.join(' '));
  const { summary, pairs } = buildMatchedCohort(current, previous);
  const result: PairedOutcomeComparison = {
    status: 'inconclusive', method: 'paired-hoeffding', metric: 'cluster-mean-matched-expectation-rate-delta', samplingUnit: 'declared-scenario-or-case',
    currentRunId: current.run.id, previousRunId: previous?.run.id,
    confidenceLevel: options.confidenceLevel ?? 0.95, minDelta: options.minDelta ?? 0, minClusters: options.minClusters ?? 2,
    independentClusters: options.independentClusters === true,
    matchedCases: summary.matchedCases, eligibleCases: summary.eligibleCases, clusters: 0, repeatedCases: summary.repeatedCases, reasons: [],
  };
  if (!previous) { result.reasons.push('baseline-unavailable'); return result; }
  if (summary.status !== 'compatible' || summary.eligibleCases !== summary.matchedCases) {
    result.reasons.push(`comparison-${summary.status}`); return result;
  }
  const groups = new Map<string, { count: number; current: number; previous: number }>();
  for (const pair of pairs) {
    for (const field of ['datasetId', 'scenarioId'] as const) {
      if (pair.current[field] !== pair.previous[field]) result.reasons.push(`${field}-grouping-changed`);
    }
    const row = pair.current;
    const key = row.scenarioId ? JSON.stringify(['scenario', row.datasetId ?? null, row.scenarioId]) : JSON.stringify(['case', row.suite, row.id]);
    const group = groups.get(key) ?? { count: 0, current: 0, previous: 0 };
    group.count += 1;
    group.current += rowMatchedExpectation(row) ? 1 : 0;
    group.previous += rowMatchedExpectation(pair.previous) ? 1 : 0;
    groups.set(key, group);
  }
  result.reasons = [...new Set(result.reasons)];
  if (result.reasons.length) return result;
  result.clusters = groups.size;
  if (!result.clusters) { result.reasons.push('no-comparable-clusters'); return result; }
  // Equal weight per independent scenario/case, not per mirrored axis row or trial.
  let currentMean = 0, previousMean = 0;
  for (const group of groups.values()) {
    currentMean += group.current / group.count;
    previousMean += group.previous / group.count;
  }
  currentMean = Math.min(1, Math.max(0, currentMean / result.clusters));
  previousMean = Math.min(1, Math.max(0, previousMean / result.clusters));
  result.observedCurrentRate = currentMean;
  result.observedPreviousRate = previousMean;
  result.observedDelta = currentMean - previousMean;
  if (!result.independentClusters) result.reasons.push('cluster-independence-not-declared');
  if (result.clusters < result.minClusters) result.reasons.push('too-few-independent-clusters');
  if (result.reasons.length) return result;
  const width = Math.sqrt(2 * Math.log(2 / (1 - result.confidenceLevel)) / result.clusters);
  result.interval = { lower: Math.max(-1, result.observedDelta - width), upper: Math.min(1, result.observedDelta + width) };
  if (result.interval.lower >= result.minDelta) result.status = 'passed';
  else if (result.interval.upper < result.minDelta) result.status = 'failed';
  else result.reasons.push('interval-overlaps-required-delta');
  return result;
};

export const describePairedComparison = (result: PairedOutcomeComparison): string => {
  const interval = result.interval ? `; ${(result.confidenceLevel * 100).toFixed(1)}% confidence interval=[${result.interval.lower.toFixed(3)}, ${result.interval.upper.toFixed(3)}]` : '; confidence interval=unavailable';
  const delta = result.observedDelta === undefined ? 'unknown' : result.observedDelta.toFixed(3);
  const explanations: Record<string, string> = {
    'baseline-unavailable': 'no baseline run is available',
    'comparison-unknown': 'measurement versions or other comparison evidence are missing',
    'comparison-incompatible': 'the runs use incompatible measurement definitions',
    'comparison-ambiguous': 'duplicate identities make matching ambiguous',
    'comparison-not-compared': 'the runs have not been compared',
    'datasetId-grouping-changed': 'dataset grouping changed between runs',
    'scenarioId-grouping-changed': 'scenario grouping changed between runs',
    'no-comparable-clusters': 'there are no matching comparison groups',
    'cluster-independence-not-declared': 'independence of the comparison groups has not been declared',
    'too-few-independent-clusters': 'there are too few comparison groups',
    'interval-overlaps-required-delta': 'the interval crosses the required change',
  };
  return `Paired comparison: ${result.status}; change=${delta}; required minimum=${result.minDelta}; comparison groups=${result.clusters}; matching cases=${result.matchedCases}${interval}${result.reasons.length ? `; ${result.reasons.map(reason => explanations[reason] ?? reason).join('; ')}` : ''}`;
};
