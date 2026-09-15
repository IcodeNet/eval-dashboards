import { type EvalReportV1, type EvalRow, rowKey, summarizeReport } from '../model/eval-report-v1.js';
import type { BypassUsageSummary } from '../gates/bypass-accounting.js';

export type BaselineStrategy = 'rolling' | 'champion';

export type HistoryBucket = {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
};

export type HistoryRegressionCounts = {
  newlyFailing: number;
  newlyPassing: number;
  persistentFailures: number;
  disappeared: number;
};

export type RowStabilityCounts = {
  stable: number;
  flaky: number;
  persistentFailure: number;
};

export type RunHistoryEntry = ReturnType<typeof summarizeReport> & {
  bySuite: Record<string, HistoryBucket>;
  byRiskArea: Record<string, HistoryBucket>;
  byKind: Record<string, HistoryBucket>;
  regression: HistoryRegressionCounts;
  /**
   * Cumulative stability counts computed across all runs up to this history entry.
   * These counts are not limited to rows present in only the current run.
   */
  rowStability: RowStabilityCounts;
  /**
   * 4F.9 — bypass accounting: which gate escape hatches were used for this run,
   * when a bypass log entry for the run's id was supplied to `buildHistory`.
   * Undefined means "no bypass data available for this run", not "no bypasses
   * were used" — callers that want a hard zero should treat `undefined` the
   * same as "unknown" rather than "clean".
   */
  bypassUsage?: BypassUsageSummary;
};

export type RowStability = 'stable' | 'flaky' | 'persistent-failure';

export type RunComparison = {
  currentRunId: string;
  previousRunId?: string;
  newlyFailing: EvalRow[];
  newlyPassing: EvalRow[];
  persistentFailures: EvalRow[];
  disappeared: EvalRow[];
};

export type RowTrend = {
  rowKey: string;
  stability: RowStability;
  failureCount: number;
  passCount: number;
};

const toBucket = (rows: EvalRow[]): HistoryBucket => {
  const total = rows.length;
  const passed = rows.filter((row) => row.passed).length;
  const failed = total - passed;
  return {
    total,
    passed,
    failed,
    passRate: total === 0 ? 0 : passed / total,
  };
};

const groupRows = (rows: EvalRow[], keyFn: (row: EvalRow) => string): Record<string, HistoryBucket> => {
  const grouped = new Map<string, EvalRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([key, groupedRows]) => [key, toBucket(groupedRows)]),
  );
};

/**
 * Build a chronological run-history timeline from a set of eval reports,
 * one entry per run with per-suite pass/fail buckets and optional bypass
 * usage attached. Input order does not matter; entries are sorted by run
 * timestamp. Used by the `history` CLI command and org-rollup tooling.
 */
export const buildHistory = (
  reports: EvalReportV1[],
  options: { bypassUsageByRunId?: Record<string, BypassUsageSummary> } = {},
): RunHistoryEntry[] => {
  const ordered = [...reports].sort(
    (left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt),
  );

  return ordered.map((report, index) => {
    const previous = index > 0 ? ordered[index - 1] : undefined;
    const comparison = compareRuns(report, previous);
    const manifestsBySuite = new Map((report.suiteManifests ?? []).map((manifest) => [manifest.name, manifest]));
    const stability = analyzeRowStability(ordered.slice(0, index + 1));
    const rowStability: RowStabilityCounts = {
      stable: 0,
      flaky: 0,
      persistentFailure: 0,
    };

    for (const trend of stability.values()) {
      if (trend.stability === 'persistent-failure') {
        rowStability.persistentFailure += 1;
      } else if (trend.stability === 'flaky') {
        rowStability.flaky += 1;
      } else {
        rowStability.stable += 1;
      }
    }

    return {
      ...summarizeReport(report),
      bySuite: groupRows(report.rows, (row) => row.suite),
      byKind: groupRows(report.rows, (row) => row.kind ?? 'unspecified'),
      byRiskArea: groupRows(
        report.rows,
        (row) => manifestsBySuite.get(row.suite)?.riskArea ?? 'unspecified',
      ),
      regression: {
        newlyFailing: comparison.newlyFailing.length,
        newlyPassing: comparison.newlyPassing.length,
        persistentFailures: comparison.persistentFailures.length,
        disappeared: comparison.disappeared.length,
      },
      rowStability,
      bypassUsage: options.bypassUsageByRunId?.[report.run.id],
    };
  });
};

/**
 * Compare a current eval run against its previous run (if any), classifying
 * every row as newly failing, newly passing, a persistent failure, or
 * disappeared, plus a per-row stability history. With no `previous` report,
 * every failing row in `current` is treated as newly failing.
 */
export const compareRuns = (
  current: EvalReportV1,
  previous?: EvalReportV1,
): RunComparison => {
  if (!previous) {
    return {
      currentRunId: current.run.id,
      newlyFailing: current.rows.filter((row) => !row.passed),
      newlyPassing: [],
      persistentFailures: [],
      disappeared: [],
    };
  }

  const previousRows = new Map(previous.rows.map((row) => [rowKey(row), row]));
  const newlyFailing: EvalRow[] = [];
  const newlyPassing: EvalRow[] = [];
  const persistentFailures: EvalRow[] = [];

  for (const currentRow of current.rows) {
    const previousRow = previousRows.get(rowKey(currentRow));

    if (!previousRow) {
      if (!currentRow.passed) {
        newlyFailing.push(currentRow);
      }
      continue;
    }

    previousRows.delete(rowKey(currentRow));

    if (previousRow.passed && !currentRow.passed) {
      newlyFailing.push(currentRow);
    } else if (!previousRow.passed && currentRow.passed) {
      newlyPassing.push(currentRow);
    } else if (!previousRow.passed && !currentRow.passed) {
      persistentFailures.push(currentRow);
    }
  }

  const disappeared = [...previousRows.values()];

  return {
    currentRunId: current.run.id,
    previousRunId: previous.run.id,
    newlyFailing,
    newlyPassing,
    persistentFailures,
    disappeared,
  };
};

/** Analyze row stability across a sequence of runs (history). */
export const analyzeRowStability = (
  reports: EvalReportV1[],
  minWindow = 3,
): Map<string, RowTrend> => {
  const sorted = [...reports].sort((left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt));

  const trends = new Map<string, { failures: number; passes: number }>();

  for (const report of sorted) {
    for (const row of report.rows) {
      const key = rowKey(row);
      const current = trends.get(key) ?? { failures: 0, passes: 0 };

      if (row.passed) {
        current.passes += 1;
      } else {
        current.failures += 1;
      }

      trends.set(key, current);
    }
  }

  const stabilities = new Map<string, RowTrend>();
  for (const [key, { failures, passes }] of trends) {
    const total = failures + passes;
    const failureRate = total > 0 ? failures / total : 0;

    let stability: RowStability;
    if (total >= minWindow && failureRate === 1) {
      // All recent runs failed
      stability = 'persistent-failure';
    } else if (total >= minWindow && failureRate > 0 && failureRate < 1) {
      // Mix of pass/fail
      stability = 'flaky';
    } else {
      // Always passes
      stability = 'stable';
    }

    stabilities.set(key, {
      rowKey: key,
      stability,
      failureCount: failures,
      passCount: passes,
    });
  }

  return stabilities;
};

/** Select baseline report by explicit run ID. */
export const selectBaseline = (
  reports: EvalReportV1[],
  baselineRunId: string,
): EvalReportV1 | undefined => {
  return reports.find((report) => report.run.id === baselineRunId);
};

type BaselineSelectionOptions = {
  strategy?: BaselineStrategy;
  lookback?: number;
};

const runMode = (report: EvalReportV1): string | undefined => {
  if (!report.metadata || typeof report.metadata !== 'object') return undefined;
  const mode = (report.metadata as Record<string, unknown>).mode;
  return typeof mode === 'string' ? mode : undefined;
};

/** Select a baseline relative to the current run using a strategy. */
export const selectBaselineByStrategy = (
  reports: EvalReportV1[],
  currentRunId: string,
  options: BaselineSelectionOptions = {},
): EvalReportV1 | undefined => {
  const strategy = options.strategy ?? 'rolling';
  const ordered = [...reports].sort(
    (left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt),
  );
  const currentIndex = ordered.findIndex((report) => report.run.id === currentRunId);

  if (currentIndex <= 0) {
    return undefined;
  }

  const candidateSlice = ordered
    .slice(0, currentIndex)
    .filter((report) => report.run.kind !== 'calibration');
  const current = ordered[currentIndex];
  const currentMode = current ? runMode(current) : undefined;
  const modeMatchedCandidates =
    currentMode !== undefined
      ? candidateSlice.filter((report) => runMode(report) === currentMode)
      : candidateSlice;
  const lookback = options.lookback;
  const candidates =
    lookback !== undefined && Number.isFinite(lookback) && lookback > 0
      ? modeMatchedCandidates.slice(-Math.trunc(lookback))
      : modeMatchedCandidates;

  if (candidates.length === 0) {
    return undefined;
  }

  if (strategy === 'rolling') {
    return candidates[candidates.length - 1];
  }

  let champion = candidates[0]!;
  let championPassRate = summarizeReport(champion).passRate;

  for (const report of candidates.slice(1)) {
    const passRate = summarizeReport(report).passRate;
    if (passRate > championPassRate) {
      champion = report;
      championPassRate = passRate;
      continue;
    }

    if (passRate === championPassRate) {
      const reportTs = Date.parse(report.run.generatedAt);
      const championTs = Date.parse(champion.run.generatedAt);
      if (reportTs > championTs) {
        champion = report;
      }
    }
  }

  return champion;
};

/** Select a report by explicit run ID. */
export const selectRun = (
  reports: EvalReportV1[],
  runId: string,
): EvalReportV1 | undefined => {
  return reports.find((report) => report.run.id === runId);
};