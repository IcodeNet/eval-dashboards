import { type EvalReportV1, type EvalRow, rowKey, summarizeReport } from '../model/eval-report-v1.js';

export type RunHistoryEntry = ReturnType<typeof summarizeReport>;

export type RowStability = 'stable' | 'flaky' | 'persistent-failure';

export type RunComparison = {
  currentRunId: string;
  previousRunId?: string;
  newlyFailing: EvalRow[];
  newlyPassing: EvalRow[];
  persistentFailures: EvalRow[];
};

export type RowTrend = {
  rowKey: string;
  stability: RowStability;
  failureCount: number;
  passCount: number;
};

export const buildHistory = (reports: EvalReportV1[]): RunHistoryEntry[] =>
  [...reports]
    .sort((left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt))
    .map((report) => summarizeReport(report));

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

    if (previousRow.passed && !currentRow.passed) {
      newlyFailing.push(currentRow);
    } else if (!previousRow.passed && currentRow.passed) {
      newlyPassing.push(currentRow);
    } else if (!previousRow.passed && !currentRow.passed) {
      persistentFailures.push(currentRow);
    }
  }

  return {
    currentRunId: current.run.id,
    previousRunId: previous.run.id,
    newlyFailing,
    newlyPassing,
    persistentFailures,
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