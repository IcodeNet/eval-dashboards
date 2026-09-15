import { randomUUID } from 'node:crypto';
import {
  type EvalReportV1,
  type EvalRow,
  type EvalSuiteSummary,
  rowMatchedExpectation,
} from '../model/eval-report-v1.js';

export const ADJUDICATION_BUNDLE_SCHEMA_VERSION = 'eval-adjudication-bundle/v1' as const;

export type ReviewerVerdict = 'pass' | 'fail';

export type AdjudicationReview = {
  verdict?: ReviewerVerdict;
  reviewer?: string;
  category?: string;
  note?: string;
  decidedAt?: string;
};

export type AdjudicationBundleRow = {
  id: string;
  suite: string;
  unresolvedReason: 'expectation-mismatch';
  currentPassed: boolean;
  expectedOutcome?: 'pass' | 'fail';
  severity?: EvalRow['severity'];
  category?: string;
  reason?: string;
  input?: string;
  output?: string;
  expected?: string;
  judgeVerdict?: boolean;
  judgeCategory?: string;
  judgeReasoning?: string;
  groundTruthVerdict?: boolean;
  groundTruthCategory?: string;
  groundTruthAnnotation?: string;
  review?: AdjudicationReview;
  reviews?: AdjudicationReview[];
};

export type AdjudicationBundleV1 = {
  schemaVersion: typeof ADJUDICATION_BUNDLE_SCHEMA_VERSION;
  bundleId: string;
  generatedAt: string;
  source: {
    runId: string;
    generatedAt: string;
  };
  rows: AdjudicationBundleRow[];
  metadata?: Record<string, unknown>;
};

export type MergeAdjudicationResult = {
  report: EvalReportV1;
  applied: number;
  skippedMissingReview: number;
  skippedInvalidVerdict: number;
  skippedInsufficientReviewers: number;
  skippedDisagreement: number;
  unmatchedRows: string[];
  disagreementRate: number | undefined;
  adjudicationDisagreements: Array<{
    suite: string;
    id: string;
    verdicts: Array<{ reviewer?: string; verdict: ReviewerVerdict }>;
  }>;
};

const cloneRow = (row: EvalRow): EvalRow => ({
  ...row,
  metadata: row.metadata ? { ...row.metadata } : undefined,
});

const normalizeVerdict = (value: unknown): ReviewerVerdict | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pass' || normalized === 'fail') return normalized;
  return undefined;
};

const recomputeSuites = (
  originalSuites: EvalSuiteSummary[],
  rows: EvalRow[],
): EvalSuiteSummary[] => {
  const tallies = new Map<string, { total: number; passed: number; failed: number }>();
  for (const row of rows) {
    const tally = tallies.get(row.suite) ?? { total: 0, passed: 0, failed: 0 };
    tally.total += 1;
    if (row.passed) tally.passed += 1;
    else tally.failed += 1;
    tallies.set(row.suite, tally);
  }

  const originalById = new Map(originalSuites.map((suite) => [suite.id, suite]));
  const orderedIds = [...originalSuites.map((suite) => suite.id)];
  for (const suiteId of tallies.keys()) {
    if (!originalById.has(suiteId)) orderedIds.push(suiteId);
  }

  return orderedIds.map((suiteId) => {
    const base = originalById.get(suiteId);
    const tally = tallies.get(suiteId) ?? { total: 0, passed: 0, failed: 0 };
    const next: EvalSuiteSummary = {
      id: suiteId,
      total: tally.total,
      passed: tally.passed,
      failed: tally.failed,
      ...(base?.name ? { name: base.name } : {}),
    };

    if (base?.passRate !== undefined) {
      next.passRate = tally.total === 0 ? 0 : tally.passed / tally.total;
    }

    return next;
  });
};

export const exportUnresolvedRowsBundle = (
  report: EvalReportV1,
  options?: {
    bundleId?: string;
    generatedAt?: string;
    includePassedRows?: boolean;
  },
): AdjudicationBundleV1 => {
  const includePassedRows = options?.includePassedRows ?? false;
  const unresolved = report.rows
    .filter((row) => !rowMatchedExpectation(row))
    .filter((row) => includePassedRows || !row.passed)
    .map<AdjudicationBundleRow>((row) => ({
      id: row.id,
      suite: row.suite,
      unresolvedReason: 'expectation-mismatch',
      currentPassed: row.passed,
      expectedOutcome: row.expectedOutcome,
      severity: row.severity,
      category: row.category,
      reason: row.reason,
      input: row.input,
      output: row.output,
      expected: row.expected,
      judgeVerdict: row.judgeVerdict,
      judgeCategory: row.judgeCategory,
      judgeReasoning: row.judgeReasoning,
      groundTruthVerdict: row.groundTruthVerdict,
      groundTruthCategory: row.groundTruthCategory,
      groundTruthAnnotation: row.groundTruthAnnotation,
      reviews: [{}, {}],
    }));

  return {
    schemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
    bundleId: options?.bundleId ?? randomUUID(),
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    source: {
      runId: report.run.id,
      generatedAt: report.run.generatedAt,
    },
    rows: unresolved,
  };
};

/**
 * Returns the effective reviews array for a bundle row, treating the legacy
 * singular `review` field as a 1-element array for backward compatibility.
 */
export const rowReviews = (row: AdjudicationBundleRow): AdjudicationReview[] => {
  if (row.reviews && row.reviews.length > 0) return row.reviews;
  if (row.review) return [row.review];
  return [];
};

export type RowAgreement = {
  verdicts: Array<{ reviewer?: string; verdict: ReviewerVerdict }>;
  agrees: boolean;
};

/**
 * Computes inter-rater agreement for a bundle row when >=2 reviewers with
 * valid verdicts are present. Returns undefined when fewer than 2 valid
 * verdicts exist (agreement is not meaningful).
 */
export const computeRowAgreement = (row: AdjudicationBundleRow): RowAgreement | undefined => {
  const reviews = rowReviews(row);
  const verdicts: Array<{ reviewer?: string; verdict: ReviewerVerdict }> = [];
  for (const review of reviews) {
    const verdict = normalizeVerdict(review.verdict);
    if (verdict !== undefined) {
      verdicts.push({ reviewer: review.reviewer, verdict });
    }
  }

  if (verdicts.length < 2) return undefined;

  const agrees = verdicts.every((entry) => entry.verdict === verdicts[0]?.verdict);
  return { verdicts, agrees };
};

export const mergeAdjudicationBundle = (
  report: EvalReportV1,
  bundle: AdjudicationBundleV1,
  options?: {
    importedAt?: string;
    sourceBundlePath?: string;
    requireRunMatch?: boolean;
    allowSingleReviewer?: boolean;
  },
): MergeAdjudicationResult => {
  const requireRunMatch = options?.requireRunMatch ?? true;
  if (
    requireRunMatch &&
    bundle.source?.runId &&
    bundle.source.runId !== report.run.id
  ) {
    throw Object.assign(
      new Error(
        `Bundle run ${bundle.source.runId} does not match target run ${report.run.id}. Use --run-id to select the matching report.`,
      ),
      { exitCode: 2 },
    );
  }

  const allowSingleReviewer = options?.allowSingleReviewer ?? false;
  const importedAt = options?.importedAt ?? new Date().toISOString();
  const indexByKey = new Map<string, number>();
  const nextRows = report.rows.map((row, index) => {
    indexByKey.set(`${row.suite}:${row.id}`, index);
    return cloneRow(row);
  });

  let applied = 0;
  let skippedMissingReview = 0;
  let skippedInvalidVerdict = 0;
  let skippedInsufficientReviewers = 0;
  let skippedDisagreement = 0;
  let agreementCount = 0;
  let disagreementCount = 0;
  const unmatchedRows: string[] = [];
  const adjudicationDisagreements: MergeAdjudicationResult['adjudicationDisagreements'] = [];

  for (const row of bundle.rows) {
    const reviews = rowReviews(row);
    if (reviews.length === 0) {
      skippedMissingReview += 1;
      continue;
    }

    const validVerdicts: Array<{ review: AdjudicationReview; verdict: ReviewerVerdict }> = [];
    for (const review of reviews) {
      const verdict = normalizeVerdict(review.verdict);
      if (verdict !== undefined) validVerdicts.push({ review, verdict });
    }

    // Distinguish "no verdicts at all" (missing) from "verdict present but invalid".
    const hasAnyVerdictField = reviews.some((review) => review.verdict !== undefined);
    if (!hasAnyVerdictField) {
      skippedMissingReview += 1;
      continue;
    }
    if (validVerdicts.length === 0) {
      skippedInvalidVerdict += 1;
      continue;
    }

    const key = `${row.suite}:${row.id}`;

    if (validVerdicts.length < 2 && !allowSingleReviewer) {
      skippedInsufficientReviewers += 1;
      continue;
    }

    let resolvedVerdict: ReviewerVerdict;
    let primaryReview: AdjudicationReview;

    if (validVerdicts.length >= 2) {
      const allAgree = validVerdicts.every((entry) => entry.verdict === validVerdicts[0]?.verdict);
      if (!allAgree) {
        disagreementCount += 1;
        skippedDisagreement += 1;
        adjudicationDisagreements.push({
          suite: row.suite,
          id: row.id,
          verdicts: validVerdicts.map((entry) => ({ reviewer: entry.review.reviewer, verdict: entry.verdict })),
        });
        continue;
      }
      agreementCount += 1;
      resolvedVerdict = validVerdicts[0]!.verdict;
      primaryReview = validVerdicts[0]!.review;
    } else {
      // Single-reviewer legacy path (allowSingleReviewer === true).
      resolvedVerdict = validVerdicts[0]!.verdict;
      primaryReview = validVerdicts[0]!.review;
    }

    const index = indexByKey.get(key);
    if (index === undefined) {
      unmatchedRows.push(key);
      continue;
    }

    const targetRow = nextRows[index];
    if (!targetRow) continue;

    const passed = resolvedVerdict === 'pass';
    targetRow.passed = passed;
    targetRow.groundTruthVerdict = passed;
    if (primaryReview.category !== undefined) {
      targetRow.groundTruthCategory = primaryReview.category;
    }
    if (primaryReview.note !== undefined) {
      targetRow.groundTruthAnnotation = primaryReview.note;
    }

    const metadata = (targetRow.metadata ??= {});
    const provenance =
      typeof metadata.provenance === 'object' && metadata.provenance !== null
        ? (metadata.provenance as Record<string, unknown>)
        : undefined;

    if (!provenance) {
      metadata.provenance = {
        source: 'production-review',
        addedBy: primaryReview.reviewer,
        reason: 'Merged reviewer verdict from adjudication bundle',
        sourceRef: bundle.bundleId,
      };
    }

    const priorTrail = Array.isArray(metadata.adjudicationTrail)
      ? [...metadata.adjudicationTrail]
      : [];
    priorTrail.push({
      bundleId: bundle.bundleId,
      importedAt,
      reviewers: validVerdicts.map((entry) => entry.review.reviewer),
      reviewer: primaryReview.reviewer,
      verdict: resolvedVerdict,
      category: primaryReview.category,
      note: primaryReview.note,
      decidedAt: primaryReview.decidedAt,
      reviewerCount: validVerdicts.length,
    });
    metadata.adjudicationTrail = priorTrail;

    applied += 1;
  }

  const disagreementRate =
    agreementCount + disagreementCount > 0
      ? disagreementCount / (agreementCount + disagreementCount)
      : undefined;

  const reportMetadata = { ...(report.metadata ?? {}) };
  const priorImports =
    reportMetadata.adjudication &&
    typeof reportMetadata.adjudication === 'object' &&
    Array.isArray((reportMetadata.adjudication as Record<string, unknown>).imports)
      ? ([...((reportMetadata.adjudication as Record<string, unknown>).imports as unknown[])] as unknown[])
      : [];

  priorImports.push({
    bundleId: bundle.bundleId,
    sourceRunId: bundle.source?.runId,
    importedAt,
    sourceBundlePath: options?.sourceBundlePath,
    allowSingleReviewer,
    totals: {
      rows: bundle.rows.length,
      applied,
      skippedMissingReview,
      skippedInvalidVerdict,
      skippedInsufficientReviewers,
      skippedDisagreement,
      unmatchedRows: unmatchedRows.length,
    },
    interRaterAgreement: {
      agreements: agreementCount,
      disagreements: disagreementCount,
      disagreementRate,
    },
    disagreements: adjudicationDisagreements,
  });

  reportMetadata.adjudication = {
    imports: priorImports,
  };

  return {
    report: {
      ...report,
      suites: recomputeSuites(report.suites, nextRows),
      rows: nextRows,
      metadata: reportMetadata,
    },
    applied,
    skippedMissingReview,
    skippedInvalidVerdict,
    skippedInsufficientReviewers,
    skippedDisagreement,
    unmatchedRows,
    disagreementRate,
    adjudicationDisagreements,
  };
};


export const validateAdjudicationBundle = (bundle: unknown): string[] => {
  const errors: string[] = [];
  if (typeof bundle !== 'object' || bundle === null) {
    return ['Bundle must be a JSON object.'];
  }

  const candidate = bundle as Record<string, unknown>;
  if (candidate.schemaVersion !== ADJUDICATION_BUNDLE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ADJUDICATION_BUNDLE_SCHEMA_VERSION}.`);
  }

  if (typeof candidate.bundleId !== 'string' || candidate.bundleId.length === 0) {
    errors.push('bundleId must be a non-empty string.');
  }

  if (
    !candidate.source ||
    typeof candidate.source !== 'object' ||
    typeof (candidate.source as Record<string, unknown>).runId !== 'string'
  ) {
    errors.push('source.runId must be a non-empty string.');
  }

  if (!Array.isArray(candidate.rows)) {
    errors.push('rows must be an array.');
  }

  return errors;
};
