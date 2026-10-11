import { describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';
import { checkGates, validateGateConfig } from '../src/gates/check-gates.js';
import { compareRuns } from '../src/history/history.js';
import { evaluatePrTierBudget, extractRowCostUsd } from '../src/gates/pr-tiering.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const report = (): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'sandbox', generatedAt: '2026-10-11T12:00:00Z' },
  suites: [{ id: 'parser', total: 2, passed: 1, failed: 1 }],
  rows: [{ id: 'failure', suite: 'parser', passed: false }, { id: 'pass', suite: 'parser', passed: true }],
});

describe('sandbox gate integrity regressions', () => {
  it.each([NaN, Infinity, -1, 1.01])('rejects invalid pass-rate policy %s for API callers', (threshold) => {
    const artifact = report();
    expect(validateGateConfig({ minPassRate: threshold })).not.toEqual([]);
    expect(checkGates(artifact, compareRuns(artifact), { minPassRate: threshold }).passed).toBe(false);
  });
  it('accepts inclusive valid rate boundaries and rejects negative count budgets', () => {
    expect(validateGateConfig({ minPassRate: 0, minMatchedExpectationRate: 1, maxNewFailures: 0 })).toEqual([]);
    expect(validateGateConfig({ maxNewFailures: -1, maxWarnings: 0.5 })).toHaveLength(2);
  });
  it('fails an empty run even with no configured thresholds', () => {
    const artifact = { ...report(), rows: [], suites: [] };
    const result = checkGates(artifact, compareRuns(artifact), {});
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain('No scored rows');
  });
  it('rejects duplicated passing identities rather than inflating the measured rate', () => {
    const artifact = report();
    artifact.rows.push(...Array.from({ length: 20 }, () => ({ ...artifact.rows[1]! })));
    // Import/display compatibility remains; the quality gate rejects ambiguity.
    expect(validateEvalReport(artifact).ok).toBe(true);
    const result = checkGates(artifact, compareRuns(artifact), { minPassRate: 0.9 });
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain('unique within a gated run');
  });
  it('permits the same case ID in different declared suites', () => {
    const artifact = report();
    artifact.suites.push({ id: 'other', total: 1, passed: 1, failed: 0 });
    artifact.rows.push({ id: 'pass', suite: 'other', passed: true });
    expect(validateEvalReport(artifact).ok).toBe(true);
  });
  it('rejects an orphan failure before a blocking suite can overlook it', () => {
    const artifact = report();
    artifact.rows[0]!.suite = 'undeclared';
    const result = validateEvalReport(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('reference a declared suite');
  });
  it.each(['durationMs', 'costUsd', 'totalTokens'])('rejects negative %s measurements', (field) => {
    const artifact = report();
    if (field === 'durationMs') artifact.rows[0]!.durationMs = -1;
    else artifact.rows[0]!.usage = { [field]: -1 };
    expect(validateEvalReport(artifact).ok).toBe(false);
  });
  it('accepts zero measurements', () => {
    const artifact = report();
    artifact.rows[0]!.durationMs = 0;
    artifact.rows[0]!.usage = { costUsd: 0, totalTokens: 0 };
    expect(validateEvalReport(artifact).ok).toBe(true);
  });
  it('canonical cost fails the budget and wins over legacy fallback without double counting', () => {
    const artifact = report();
    artifact.rows[0]!.usage = { costUsd: 100 };
    artifact.rows[0]!.metadata = { costUsd: 0.01 };
    expect(extractRowCostUsd(artifact.rows[0]!)).toBe(100);
    const result = evaluatePrTierBudget(artifact, { tier: 'pr', maxCostUsd: 1 });
    expect(result.summary.totalCostUsd).toBe(100);
    expect(result.failures).toHaveLength(1);
    artifact.rows[0]!.usage = { costUsd: 0 };
    expect(extractRowCostUsd(artifact.rows[0]!)).toBe(0);
    delete artifact.rows[0]!.usage;
    expect(extractRowCostUsd(artifact.rows[0]!)).toBe(0.01);
  });
});
