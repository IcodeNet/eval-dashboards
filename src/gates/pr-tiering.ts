/**
 * 4F.10 — PR-subset vs full-suite tiering with a cost budget.
 *
 * Problem this solves: as a suite of judge-scored evals grows, PR gating time
 * and $ judge cost grow with it. Teams under pressure respond by moving the
 * gate to a nightly/scheduled run, which quietly removes PR-time protection
 * entirely. This module gives suites a first-class `tier` (pr | full | both)
 * so a team can keep a fast, explicitly budgeted subset gating every PR while
 * the full suite still runs on a schedule — and makes the budget a checkable,
 * auditable number instead of an unstated assumption.
 */

import type { EvalReportV1, EvalRow, SuiteManifest } from '../model/eval-report-v1.js';

export const SUITE_TIERS = ['pr', 'full', 'both'] as const;
export type SuiteTier = (typeof SUITE_TIERS)[number];

/** Default tier for a suite manifest that does not declare one explicitly. */
export const DEFAULT_SUITE_TIER: SuiteTier = 'both';

/** Resolve the effective tier for a suite manifest (defaults to `both`). */
export const resolveSuiteTier = (manifest: Pick<SuiteManifest, 'tier'>): SuiteTier =>
  manifest.tier ?? DEFAULT_SUITE_TIER;

/** Whether a suite tagged with `suiteTier` participates in a run gated at `selectedTier`. */
export const suiteParticipatesInTier = (suiteTier: SuiteTier, selectedTier: 'pr' | 'full'): boolean => {
  if (suiteTier === 'both') return true;
  return suiteTier === selectedTier;
};

const getNestedNumber = (value: unknown, keys: string[]): number | undefined => {
  let current: unknown = value;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
};

/** Extract a row's judge/agent cost in USD, tolerating the documented metadata aliases. */
export const extractRowCostUsd = (row: EvalRow): number | undefined => {
  const metadata = row.metadata as Record<string, unknown> | undefined;
  return (
    getNestedNumber(metadata, ['costUsd']) ??
    getNestedNumber(metadata, ['costUSD']) ??
    getNestedNumber(metadata, ['usdCost']) ??
    getNestedNumber(metadata, ['cost', 'usd']) ??
    getNestedNumber(metadata, ['pricing', 'costUsd'])
  );
};

/** Which suite names (by manifest) belong to a given tier for this report. */
export const suitesInTier = (
  suiteManifests: SuiteManifest[],
  selectedTier: 'pr' | 'full',
): string[] =>
  suiteManifests
    .filter((manifest) => suiteParticipatesInTier(resolveSuiteTier(manifest), selectedTier))
    .map((manifest) => manifest.name);

/**
 * Filter a report down to only the suites/rows that belong to `selectedTier`.
 *
 * Suites with no manifest entry (untagged) are treated as `both` and always
 * included — tiering is opt-in per suite, not opt-out, so an unlabelled suite
 * never silently disappears from PR gating.
 */
export const filterReportByTier = (
  report: EvalReportV1,
  selectedTier: 'pr' | 'full',
): EvalReportV1 => {
  const manifestByName = new Map((report.suiteManifests ?? []).map((manifest) => [manifest.name, manifest]));

  const suiteIncluded = (suiteId: string): boolean => {
    const manifest = manifestByName.get(suiteId);
    if (!manifest) return true;
    return suiteParticipatesInTier(resolveSuiteTier(manifest), selectedTier);
  };

  return {
    ...report,
    suites: report.suites.filter((suite) => suiteIncluded(suite.id)),
    rows: report.rows.filter((row) => suiteIncluded(row.suite)),
    suiteManifests: report.suiteManifests?.filter((manifest) =>
      suiteParticipatesInTier(resolveSuiteTier(manifest), selectedTier),
    ),
  };
};

/** Per-tier cost/runtime summary used for budget checks and reporting. */
export type TierCostSummary = {
  tier: 'pr' | 'full';
  suiteCount: number;
  rowCount: number;
  totalDurationMs: number;
  totalCostUsd: number;
  rowsMissingCost: number;
};

/** Summarize runtime and judge/agent cost for the rows that belong to `selectedTier`. */
export const summarizeTierCost = (
  report: EvalReportV1,
  selectedTier: 'pr' | 'full',
): TierCostSummary => {
  const tiered = filterReportByTier(report, selectedTier);
  let totalDurationMs = 0;
  let totalCostUsd = 0;
  let rowsMissingCost = 0;

  for (const row of tiered.rows) {
    totalDurationMs += row.durationMs ?? 0;
    const cost = extractRowCostUsd(row);
    if (cost === undefined) {
      rowsMissingCost += 1;
    } else {
      totalCostUsd += cost;
    }
  }

  return {
    tier: selectedTier,
    suiteCount: tiered.suites.length,
    rowCount: tiered.rows.length,
    totalDurationMs,
    totalCostUsd,
    rowsMissingCost,
  };
};

/** Cost/runtime budget configuration for PR-tier gating. */
export type PrTierBudgetConfig = {
  /** Which tier this invocation is gating. Default: `full` (no filtering, backward compatible). */
  tier?: 'pr' | 'full';
  /** Maximum total judge/agent cost (USD) allowed for the selected tier's rows. */
  maxCostUsd?: number;
  /** Maximum total wall-clock runtime (ms, summed row `durationMs`) allowed for the selected tier's rows. */
  maxDurationMs?: number;
};

export type PrTierBudgetResult = {
  summary: TierCostSummary;
  failures: string[];
  diagnostics: string[];
};

/**
 * Evaluate a report's selected tier against an explicit cost/runtime budget.
 * Always returns a summary so a clean, in-budget run is a verifiable number,
 * not an absent field.
 */
export const evaluatePrTierBudget = (
  report: EvalReportV1,
  config: PrTierBudgetConfig,
): PrTierBudgetResult => {
  const tier = config.tier ?? 'full';
  const summary = summarizeTierCost(report, tier);
  const failures: string[] = [];
  const diagnostics: string[] = [
    `PR tier gate: tier=${tier} suites=${summary.suiteCount} rows=${summary.rowCount} ` +
      `costUsd=${summary.totalCostUsd.toFixed(4)} durationMs=${summary.totalDurationMs}` +
      (summary.rowsMissingCost > 0 ? ` (rowsMissingCost=${summary.rowsMissingCost})` : ''),
  ];

  if (config.maxCostUsd !== undefined && summary.totalCostUsd > config.maxCostUsd) {
    failures.push(
      `PR tier "${tier}" judge/agent cost $${summary.totalCostUsd.toFixed(4)} exceeds budget $${config.maxCostUsd.toFixed(4)}.`,
    );
  }

  if (config.maxDurationMs !== undefined && summary.totalDurationMs > config.maxDurationMs) {
    failures.push(
      `PR tier "${tier}" runtime ${summary.totalDurationMs}ms exceeds budget ${config.maxDurationMs}ms.`,
    );
  }

  return { summary, failures, diagnostics };
};
