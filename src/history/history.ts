import { type EvalReportV1, type EvalRow, rowKey, summarizeReport } from '../model/eval-report-v1.js';

export type RunHistoryEntry = ReturnType<typeof summarizeReport>;

export type RunComparison = {
  currentRunId: string;
  previousRunId?: string;
  newlyFailing: EvalRow[];
  newlyPassing: EvalRow[];
  persistentFailures: EvalRow[];
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