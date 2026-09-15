/**
 * 4F.8 — Static org rollup index.
 *
 * Renders one static, offline HTML overview from N *already-published*
 * per-repo `history.json` artifacts (the same file `eval-dashboards history`
 * or `report --reporter=html` already writes). This intentionally does not
 * ingest raw eval reports, does not talk to any repo's CI, and has no
 * server/auth/API — it is a pure function over files a human or CI job
 * copies onto local disk (or a shared static host) ahead of time.
 *
 * Charter constraint (AGENTS.md): must not become a hosted platform. This
 * module reads local files and writes one static HTML file; nothing here
 * listens on a port, authenticates a caller, or accepts remote input.
 */
import type { RunHistoryEntry } from './history.js';

export type RepoHistory = {
  /** Repo/agent label. Derived from the history file's directory or filename unless overridden. */
  repo: string;
  /** Path the history was read from, for provenance display. */
  sourcePath: string;
  /** Ordered oldest -> newest, as produced by `buildHistory`. */
  entries: RunHistoryEntry[];
};

export type OrgRollupTrend = 'regressed' | 'improved' | 'stable' | 'new';

export type OrgRollupRow = {
  repo: string;
  sourcePath: string;
  latest?: RunHistoryEntry;
  previous?: RunHistoryEntry;
  runCount: number;
  passRate: number;
  passRateDelta?: number;
  criticalFailures: number;
  newlyFailing: number;
  persistentFailures: number;
  trend: OrgRollupTrend;
  generatedAt?: string;
};

export type OrgRollupSummary = {
  generatedAt: string;
  rows: OrgRollupRow[];
  regressedCount: number;
  totalRepos: number;
};

const REGRESSION_PASS_RATE_DROP = 0.02;

const criticalFailureCount = (entry: RunHistoryEntry | undefined): number =>
  entry?.severityCounts?.critical ?? 0;

/**
 * Parse a raw history.json payload (as written by `eval-dashboards history`
 * or embedded by `report --reporter=html`) into an ordered RunHistoryEntry[].
 * Tolerant of the two known shapes: a bare array, or `{ history: [...] }`.
 */
export const parseHistoryPayload = (raw: unknown): RunHistoryEntry[] => {
  const candidate = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).history)
      ? (raw as Record<string, unknown>).history
      : undefined;

  if (!Array.isArray(candidate)) {
    throw new Error('Expected a history JSON array (or { history: [...] }) of RunHistoryEntry objects.');
  }

  for (const entry of candidate) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as Record<string, unknown>).passRate !== 'number' ||
      !(entry as Record<string, unknown>).run
    ) {
      throw new Error('Malformed history entry: expected an object with `run` and numeric `passRate`.');
    }
  }

  return (candidate as RunHistoryEntry[]).slice().sort(
    (left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt),
  );
};

const deriveRepoLabel = (sourcePath: string, entries: RunHistoryEntry[]): string => {
  const latest = entries[entries.length - 1];
  const project = latest?.run.project;
  if (project) return project;

  const normalized = sourcePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? sourcePath;
  const withoutExt = fileName.replace(/\.history\.json$/i, '').replace(/\.json$/i, '');
  const parentDir = segments[segments.length - 2];

  if (withoutExt && withoutExt !== 'history') return withoutExt;
  return parentDir ?? withoutExt ?? sourcePath;
};

export const repoHistoryFromPayload = (sourcePath: string, raw: unknown, repoOverride?: string): RepoHistory => {
  const entries = parseHistoryPayload(raw);
  return {
    repo: repoOverride ?? deriveRepoLabel(sourcePath, entries),
    sourcePath,
    entries,
  };
};

const rowForRepo = (history: RepoHistory): OrgRollupRow => {
  const { entries } = history;
  const latest = entries[entries.length - 1];
  const previous = entries.length > 1 ? entries[entries.length - 2] : undefined;

  const passRate = latest?.passRate ?? 0;
  const passRateDelta = previous ? passRate - previous.passRate : undefined;
  const criticalFailures = criticalFailureCount(latest);
  const previousCritical = criticalFailureCount(previous);

  let trend: OrgRollupTrend = 'stable';
  if (!previous) {
    trend = 'new';
  } else if (
    (passRateDelta !== undefined && passRateDelta < -REGRESSION_PASS_RATE_DROP) ||
    criticalFailures > previousCritical ||
    (latest?.regression.newlyFailing ?? 0) > 0
  ) {
    trend = 'regressed';
  } else if (passRateDelta !== undefined && passRateDelta > REGRESSION_PASS_RATE_DROP) {
    trend = 'improved';
  }

  return {
    repo: history.repo,
    sourcePath: history.sourcePath,
    latest,
    previous,
    runCount: entries.length,
    passRate,
    passRateDelta,
    criticalFailures,
    newlyFailing: latest?.regression.newlyFailing ?? 0,
    persistentFailures: latest?.rowStability.persistentFailure ?? 0,
    trend,
    generatedAt: latest?.run.generatedAt,
  };
};

export const buildOrgRollup = (histories: RepoHistory[]): OrgRollupSummary => {
  const rows = histories
    .map(rowForRepo)
    .sort((left, right) => {
      // Regressed repos first (the "which agent regressed this week" answer),
      // then by pass rate ascending, then alphabetically.
      const rank = (row: OrgRollupRow) => (row.trend === 'regressed' ? 0 : row.trend === 'stable' ? 1 : row.trend === 'new' ? 2 : 3);
      const rankDelta = rank(left) - rank(right);
      if (rankDelta !== 0) return rankDelta;
      if (left.passRate !== right.passRate) return left.passRate - right.passRate;
      return left.repo.localeCompare(right.repo);
    });

  return {
    generatedAt: new Date().toISOString(),
    rows,
    regressedCount: rows.filter((row) => row.trend === 'regressed').length,
    totalRepos: rows.length,
  };
};
