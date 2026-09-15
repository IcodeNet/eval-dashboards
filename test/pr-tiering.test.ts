import { describe, expect, it } from 'vitest';
import {
  resolveSuiteTier,
  suiteParticipatesInTier,
  filterReportByTier,
  summarizeTierCost,
  evaluatePrTierBudget,
  extractRowCostUsd,
  suitesInTier,
  DEFAULT_SUITE_TIER,
} from '../src/gates/pr-tiering.js';
import type { EvalReportV1, SuiteManifest } from '../src/model/eval-report-v1.js';

const manifest = (name: string, tier?: 'pr' | 'full' | 'both'): SuiteManifest => ({
  name,
  target: 'agent',
  datasetSource: 'synthetic',
  datasetVersion: '1',
  riskArea: 'response-quality',
  graders: ['deterministic-assertions'],
  gate: { mode: 'blocking', thresholds: {} },
  tier,
});

const buildReport = (): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z' },
  suites: [
    { id: 'fast-suite', total: 2, passed: 2, failed: 0 },
    { id: 'slow-suite', total: 1, passed: 1, failed: 0 },
    { id: 'untagged-suite', total: 1, passed: 1, failed: 0 },
  ],
  rows: [
    { id: 'r1', suite: 'fast-suite', passed: true, durationMs: 100, metadata: { costUsd: 0.01 } },
    { id: 'r2', suite: 'fast-suite', passed: true, durationMs: 200, metadata: { costUsd: 0.02 } },
    { id: 'r3', suite: 'slow-suite', passed: true, durationMs: 5000, metadata: { costUsd: 1.5 } },
    { id: 'r4', suite: 'untagged-suite', passed: true, durationMs: 50 },
  ],
  suiteManifests: [manifest('fast-suite', 'pr'), manifest('slow-suite', 'full'), manifest('untagged-suite')],
});

describe('resolveSuiteTier / suiteParticipatesInTier', () => {
  it('defaults an untagged manifest to "both"', () => {
    expect(resolveSuiteTier({ tier: undefined })).toBe(DEFAULT_SUITE_TIER);
    expect(resolveSuiteTier({ tier: undefined })).toBe('both');
  });

  it('a "both" suite participates in every tier', () => {
    expect(suiteParticipatesInTier('both', 'pr')).toBe(true);
    expect(suiteParticipatesInTier('both', 'full')).toBe(true);
  });

  it('a "pr" suite participates only in pr; a "full" suite only in full', () => {
    expect(suiteParticipatesInTier('pr', 'pr')).toBe(true);
    expect(suiteParticipatesInTier('pr', 'full')).toBe(false);
    expect(suiteParticipatesInTier('full', 'full')).toBe(true);
    expect(suiteParticipatesInTier('full', 'pr')).toBe(false);
  });
});

describe('extractRowCostUsd', () => {
  it('reads the canonical costUsd field', () => {
    expect(extractRowCostUsd({ id: 'a', suite: 's', passed: true, metadata: { costUsd: 0.5 } })).toBe(0.5);
  });

  it('tolerates documented aliases', () => {
    expect(extractRowCostUsd({ id: 'a', suite: 's', passed: true, metadata: { costUSD: 0.1 } })).toBe(0.1);
    expect(extractRowCostUsd({ id: 'a', suite: 's', passed: true, metadata: { usdCost: 0.2 } })).toBe(0.2);
    expect(
      extractRowCostUsd({ id: 'a', suite: 's', passed: true, metadata: { cost: { usd: 0.3 } } }),
    ).toBe(0.3);
    expect(
      extractRowCostUsd({ id: 'a', suite: 's', passed: true, metadata: { pricing: { costUsd: 0.4 } } }),
    ).toBe(0.4);
  });

  it('returns undefined when no cost metadata is present', () => {
    expect(extractRowCostUsd({ id: 'a', suite: 's', passed: true })).toBeUndefined();
  });
});

describe('filterReportByTier', () => {
  it('keeps only pr-tagged and untagged (both) suites for the pr tier', () => {
    const report = buildReport();
    const filtered = filterReportByTier(report, 'pr');
    const suiteIds = filtered.suites.map((s) => s.id).sort();
    expect(suiteIds).toEqual(['fast-suite', 'untagged-suite']);
    expect(filtered.rows.map((r) => r.suite).sort()).toEqual(['fast-suite', 'fast-suite', 'untagged-suite']);
  });

  it('keeps only full-tagged and untagged (both) suites for the full tier', () => {
    const report = buildReport();
    const filtered = filterReportByTier(report, 'full');
    const suiteIds = filtered.suites.map((s) => s.id).sort();
    expect(suiteIds).toEqual(['slow-suite', 'untagged-suite']);
  });
});

describe('suitesInTier', () => {
  it('lists suite names participating in a tier', () => {
    const report = buildReport();
    expect(suitesInTier(report.suiteManifests ?? [], 'pr').sort()).toEqual(['fast-suite', 'untagged-suite']);
    expect(suitesInTier(report.suiteManifests ?? [], 'full').sort()).toEqual(['slow-suite', 'untagged-suite']);
  });
});

describe('summarizeTierCost', () => {
  it('sums cost and duration only for rows in the selected tier', () => {
    const report = buildReport();
    const summary = summarizeTierCost(report, 'pr');
    expect(summary.rowCount).toBe(3);
    expect(summary.totalDurationMs).toBe(100 + 200 + 50);
    expect(summary.totalCostUsd).toBeCloseTo(0.03, 5);
    expect(summary.rowsMissingCost).toBe(1);
  });
});

describe('evaluatePrTierBudget', () => {
  it('passes cleanly with no failures when under budget', () => {
    const report = buildReport();
    const result = evaluatePrTierBudget(report, { tier: 'pr', maxCostUsd: 1, maxDurationMs: 10000 });
    expect(result.failures).toEqual([]);
    expect(result.summary.tier).toBe('pr');
  });

  it('fails when the tier exceeds the cost budget', () => {
    const report = buildReport();
    const result = evaluatePrTierBudget(report, { tier: 'pr', maxCostUsd: 0.01 });
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toMatch(/cost/i);
  });

  it('fails when the tier exceeds the duration budget', () => {
    const report = buildReport();
    const result = evaluatePrTierBudget(report, { tier: 'full', maxDurationMs: 100 });
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toMatch(/runtime/i);
  });

  it('defaults to the full tier (no filtering of pr-only suites) when tier is omitted', () => {
    const report = buildReport();
    const result = evaluatePrTierBudget(report, {});
    expect(result.summary.tier).toBe('full');
    expect(result.summary.rowCount).toBe(2);
  });
});
