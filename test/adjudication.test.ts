import { describe, expect, it } from 'vitest';
import {
  ADJUDICATION_BUNDLE_SCHEMA_VERSION,
  exportUnresolvedRowsBundle,
  mergeAdjudicationBundle,
  validateAdjudicationBundle,
  type AdjudicationBundleV1,
} from '../src/adjudication/bundles.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';

const baseReport = (): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: {
    id: 'run-1',
    generatedAt: '2026-09-12T00:00:00.000Z',
  },
  suites: [{ id: 'quality', total: 3, passed: 1, failed: 2 }],
  rows: [
    { id: 'row-pass', suite: 'quality', passed: true },
    {
      id: 'row-fail',
      suite: 'quality',
      passed: false,
      category: 'groundedness',
      reason: 'Unsupported claim',
      judgeVerdict: false,
    },
    {
      id: 'row-expected-fail',
      suite: 'quality',
      passed: true,
      expectedOutcome: 'fail',
      reason: 'Expected this probe to fail but it passed.',
    },
  ],
});

describe('adjudication bundles', () => {
  it('exports unresolved rows by default from expectation mismatches that currently fail', () => {
    const bundle = exportUnresolvedRowsBundle(baseReport());
    expect(bundle.schemaVersion).toBe(ADJUDICATION_BUNDLE_SCHEMA_VERSION);
    expect(bundle.source.runId).toBe('run-1');
    expect(bundle.rows.map((row) => row.id)).toEqual(['row-fail']);
  });

  it('can include unresolved rows that currently pass', () => {
    const bundle = exportUnresolvedRowsBundle(baseReport(), { includePassedRows: true });
    expect(bundle.rows.map((row) => row.id)).toEqual(['row-fail', 'row-expected-fail']);
  });

  it('merges reviewer verdicts back into row outcomes and metadata trail', () => {
    const bundle: AdjudicationBundleV1 = {
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-1',
      generatedAt: '2026-09-12T00:05:00.000Z',
      source: {
        runId: 'run-1',
        generatedAt: '2026-09-12T00:00:00.000Z',
      },
      rows: [
        {
          id: 'row-fail',
          suite: 'quality',
          unresolvedReason: 'expectation-mismatch',
          currentPassed: false,
          review: {
            verdict: 'pass',
            reviewer: 'qa-reviewer',
            note: 'Manual replay confirms this should pass.',
            category: 'manual-confirmed',
            decidedAt: '2026-09-12T00:06:00.000Z',
          },
        },
      ],
    };

    const merged = mergeAdjudicationBundle(baseReport(), bundle, {
      importedAt: '2026-09-12T00:07:00.000Z',
      sourceBundlePath: '/tmp/bundle.json',
      allowSingleReviewer: true,
    });

    expect(merged.applied).toBe(1);
    expect(merged.unmatchedRows).toEqual([]);

    const row = merged.report.rows.find((candidate) => candidate.id === 'row-fail');
    expect(row?.passed).toBe(true);
    expect(row?.groundTruthVerdict).toBe(true);
    expect(row?.groundTruthCategory).toBe('manual-confirmed');
    expect(row?.groundTruthAnnotation).toContain('Manual replay confirms');

    const rowTrail = row?.metadata?.adjudicationTrail as unknown[];
    expect(Array.isArray(rowTrail)).toBe(true);
    expect(rowTrail).toHaveLength(1);

    const suite = merged.report.suites.find((candidate) => candidate.id === 'quality');
    expect(suite).toMatchObject({ total: 3, passed: 3, failed: 0 });
    expect(lintReportTaxonomy(merged.report).passed).toBe(true);

    const topLevelImports = (
      merged.report.metadata?.adjudication as { imports: Array<{ bundleId: string }> }
    ).imports;
    expect(topLevelImports).toHaveLength(1);
    expect(topLevelImports[0]?.bundleId).toBe('bundle-1');
  });

  it('fails import when bundle run id mismatches target run', () => {
    const bundle: AdjudicationBundleV1 = {
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-mismatch',
      generatedAt: '2026-09-12T00:05:00.000Z',
      source: {
        runId: 'run-2',
        generatedAt: '2026-09-12T00:04:00.000Z',
      },
      rows: [],
    };

    expect(() => mergeAdjudicationBundle(baseReport(), bundle)).toThrow(
      /does not match target run run-1/,
    );
  });

  it('validates adjudication bundle schema basics', () => {
    const errors = validateAdjudicationBundle({
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-ok',
      source: { runId: 'run-1' },
      rows: [],
    });

    expect(errors).toEqual([]);

    const invalid = validateAdjudicationBundle({
      schemaVersion: 'wrong',
      rows: 'not-array',
    });
    expect(invalid.length).toBeGreaterThan(0);
  });

  it('applies a row when 2 reviewers agree, and reports disagreement rate', () => {
    const bundle: AdjudicationBundleV1 = {
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-two-agree',
      generatedAt: '2026-09-12T00:05:00.000Z',
      source: { runId: 'run-1', generatedAt: '2026-09-12T00:00:00.000Z' },
      rows: [
        {
          id: 'row-fail',
          suite: 'quality',
          unresolvedReason: 'expectation-mismatch',
          currentPassed: false,
          reviews: [
            { verdict: 'pass', reviewer: 'reviewer-a' },
            { verdict: 'pass', reviewer: 'reviewer-b' },
          ],
        },
      ],
    };

    const merged = mergeAdjudicationBundle(baseReport(), bundle);
    expect(merged.applied).toBe(1);
    expect(merged.skippedDisagreement).toBe(0);
    expect(merged.skippedInsufficientReviewers).toBe(0);
    expect(merged.disagreementRate).toBe(0);

    const row = merged.report.rows.find((candidate) => candidate.id === 'row-fail');
    expect(row?.passed).toBe(true);
    expect(row?.groundTruthVerdict).toBe(true);
  });

  it('skips and records disagreement when 2 reviewers disagree', () => {
    const bundle: AdjudicationBundleV1 = {
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-two-disagree',
      generatedAt: '2026-09-12T00:05:00.000Z',
      source: { runId: 'run-1', generatedAt: '2026-09-12T00:00:00.000Z' },
      rows: [
        {
          id: 'row-fail',
          suite: 'quality',
          unresolvedReason: 'expectation-mismatch',
          currentPassed: false,
          reviews: [
            { verdict: 'pass', reviewer: 'reviewer-a' },
            { verdict: 'fail', reviewer: 'reviewer-b' },
          ],
        },
      ],
    };

    const merged = mergeAdjudicationBundle(baseReport(), bundle);
    expect(merged.applied).toBe(0);
    expect(merged.skippedDisagreement).toBe(1);
    expect(merged.disagreementRate).toBe(1);
    expect(merged.adjudicationDisagreements).toHaveLength(1);
    expect(merged.adjudicationDisagreements[0]?.id).toBe('row-fail');

    const row = merged.report.rows.find((candidate) => candidate.id === 'row-fail');
    expect(row?.passed).toBe(false);
    expect(row?.groundTruthVerdict).toBeUndefined();
  });

  it('applies a single reviewer only when allowSingleReviewer is true (legacy opt-down)', () => {
    const bundle: AdjudicationBundleV1 = {
      schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
      bundleId: 'bundle-single',
      generatedAt: '2026-09-12T00:05:00.000Z',
      source: { runId: 'run-1', generatedAt: '2026-09-12T00:00:00.000Z' },
      rows: [
        {
          id: 'row-fail',
          suite: 'quality',
          unresolvedReason: 'expectation-mismatch',
          currentPassed: false,
          review: { verdict: 'pass', reviewer: 'solo-reviewer' },
        },
      ],
    };

    const withoutFlag = mergeAdjudicationBundle(baseReport(), bundle);
    expect(withoutFlag.applied).toBe(0);
    expect(withoutFlag.skippedInsufficientReviewers).toBe(1);
    const rowWithoutFlag = withoutFlag.report.rows.find((candidate) => candidate.id === 'row-fail');
    expect(rowWithoutFlag?.passed).toBe(false);

    const withFlag = mergeAdjudicationBundle(baseReport(), bundle, { allowSingleReviewer: true });
    expect(withFlag.applied).toBe(1);
    expect(withFlag.skippedInsufficientReviewers).toBe(0);
    const rowWithFlag = withFlag.report.rows.find((candidate) => candidate.id === 'row-fail');
    expect(rowWithFlag?.passed).toBe(true);
    expect(rowWithFlag?.groundTruthVerdict).toBe(true);
  });
});
