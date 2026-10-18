import type { RunHistoryEntry } from './history.js';

export type HistoryQuery = {
  /** Keep runs generated at or after this ISO date. */
  since?: string;
  /** Keep runs generated at or before this ISO date. */
  until?: string;
  branch?: string;
  /** Keep runs that include this suite. */
  suite?: string;
};

export type HistoryRetention = {
  /** Keep only the newest N runs. */
  keepLast?: number;
  /** Drop runs older than this many days before `now`. */
  maxAgeDays?: number;
  now?: Date;
};

export type TrendPoint = {
  runId: string;
  generatedAt: string;
  branch?: string;
  passRate: number;
  total: number;
  failed: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (label: string, value: string): number => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`${label} must be an ISO date such as 2026-10-01, got "${value}".`);
  }
  return time;
};

const byDate = (left: RunHistoryEntry, right: RunHistoryEntry): number =>
  Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt);

/** Filters history by date range, branch and suite, returning entries oldest to newest. */
export const queryHistory = (entries: RunHistoryEntry[], query: HistoryQuery = {}): RunHistoryEntry[] => {
  const since = query.since === undefined ? undefined : parseDate('--since', query.since);
  const until = query.until === undefined ? undefined : parseDate('--until', query.until);

  return entries
    .filter((entry) => {
      const generatedAt = Date.parse(entry.run.generatedAt);
      if (since !== undefined && generatedAt < since) return false;
      if (until !== undefined && generatedAt > until) return false;
      if (query.branch !== undefined && entry.run.branch !== query.branch) return false;
      if (query.suite !== undefined && !(query.suite in entry.bySuite)) return false;
      return true;
    })
    .sort(byDate);
};

/** Drops old runs by count and age, returning the kept entries oldest to newest. */
export const applyRetention = (entries: RunHistoryEntry[], retention: HistoryRetention): RunHistoryEntry[] => {
  const { keepLast, maxAgeDays } = retention;
  if (keepLast !== undefined && (!Number.isInteger(keepLast) || keepLast < 1)) {
    throw new Error('--keep-last must be a whole number of 1 or more.');
  }
  if (maxAgeDays !== undefined && (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0)) {
    throw new Error('--max-age-days must be a number greater than 0.');
  }

  let kept = [...entries].sort(byDate);
  if (maxAgeDays !== undefined) {
    const cutoff = (retention.now ?? new Date()).getTime() - maxAgeDays * DAY_MS;
    kept = kept.filter((entry) => Date.parse(entry.run.generatedAt) >= cutoff);
  }
  if (keepLast !== undefined) kept = kept.slice(-keepLast);
  return kept;
};

/** Builds one pass-rate point per run. With `suite`, the rate is that suite's own. */
export const buildTrendSeries = (entries: RunHistoryEntry[], suite?: string): TrendPoint[] =>
  entries.map((entry) => {
    const bucket = suite === undefined ? undefined : entry.bySuite[suite];
    return {
      runId: entry.run.id,
      generatedAt: entry.run.generatedAt,
      branch: entry.run.branch,
      passRate: bucket ? bucket.passRate : entry.passRate,
      total: bucket ? bucket.total : entry.total,
      failed: bucket ? bucket.failed : entry.failed,
    };
  });
