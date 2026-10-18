import type { EvalReportV1, EvalRow, RowMetadata } from './eval-report-v1.js';

/**
 * 4F.1 — Two-tier artifact split.
 *
 * A raw `eval-report/v1` artifact mixes a "public" tier (counts, rates, ids,
 * categories, severities, verdicts, versions) with a "sensitive" tier
 * (prompts, model outputs, retrieved chunks, judge reasoning). Publish
 * targets must consume only the public tier by default.
 *
 * This module strips the sensitive-tier fields from a row/report, leaving
 * everything else (including which fields *were* present, so downstream
 * tooling can render a "redacted" affordance) intact.
 */

/** Row fields considered sensitive raw evidence text. */
export const SENSITIVE_ROW_FIELDS = [
  'question',
  'judgeReasoning',
  'agentReasoning',
  'groundTruthAnnotation',
  'input',
  'output',
  'expected',
  'reason',
  'judgeTraces',
  'axisReasoning',
] as const satisfies ReadonlyArray<keyof EvalRow>;

export const REDACTED_PLACEHOLDER = '[redacted]';

/** Metadata keys the reports read, so they are part of the public tier. Everything else is free-form. */
const PUBLIC_METADATA_KEYS = new Set([
  'provenance',
  'lifecycle',
  'costUsd',
  'cost',
  'costUSD',
  'latencyMs',
  'mode',
  'redactionProfile',
  'redacted',
]);

const redactRowMetadata = (metadata?: RowMetadata): RowMetadata | undefined => {
  if (!metadata) return metadata;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, PUBLIC_METADATA_KEYS.has(key) ? value : REDACTED_PLACEHOLDER]),
  ) as RowMetadata;
};

const redactTrace = (trace: NonNullable<EvalRow['trace']>): NonNullable<EvalRow['trace']> => ({
  ...(trace.traceId !== undefined ? { traceId: trace.traceId } : {}),
  ...(trace.spanId !== undefined ? { spanId: trace.spanId } : {}),
  ...(trace.spanType !== undefined ? { spanType: trace.spanType } : {}),
});

/** Returns a copy of `row` with all sensitive evidence text fields removed. */
export const redactEvalRow = (row: EvalRow): EvalRow => {
  const redacted: EvalRow = { ...row };

  for (const field of SENSITIVE_ROW_FIELDS) {
    if (redacted[field] !== undefined) {
      delete redacted[field];
    }
  }

  if (redacted.turns) {
    redacted.turns = redacted.turns.map((turn) => ({
      role: turn.role,
      timestamp: turn.timestamp,
      durationMs: turn.durationMs,
      // Keep the public tool name, but discard raw arguments and results.
      content: REDACTED_PLACEHOLDER,
      ...(turn.toolCall ? { toolCall: { name: turn.toolCall.name, args: {} } } : {}),
    }));
  }

  if (redacted.toolCalls) {
    redacted.toolCalls = redacted.toolCalls.map((call) => ({
      name: call.name,
      durationMs: call.durationMs,
      resultIsError: call.resultIsError,
      ...(call.result !== undefined ? { result: REDACTED_PLACEHOLDER } : {}),
    }));
  }

  if (redacted.humanReviews) {
    redacted.humanReviews = redacted.humanReviews.map((review) => ({
      reviewer: REDACTED_PLACEHOLDER,
      verdict: review.verdict,
      ...(review.category !== undefined ? { category: review.category } : {}),
      ...(review.decidedAt !== undefined ? { decidedAt: review.decidedAt } : {}),
    }));
  }

  if (redacted.checks) {
    redacted.checks = redacted.checks.map((check) => ({
      type: check.type,
      pass: check.pass,
      ...(check.threshold !== undefined ? { threshold: check.threshold } : {}),
      ...(check.weight !== undefined ? { weight: check.weight } : {}),
    }));
  }

  if (redacted.trace) {
    redacted.trace = redactTrace(redacted.trace);
  }

  redacted.metadata = redactRowMetadata(redacted.metadata);

  return redacted;
};

const redactRunConfigSnapshot = (run: EvalReportV1['run']): EvalReportV1['run'] => {
  if (!run.configSnapshot) return run;
  const values = Object.fromEntries(
    Object.keys(run.configSnapshot.values).map((key) => [key, REDACTED_PLACEHOLDER]),
  );
  return { ...run, configSnapshot: { ...run.configSnapshot, redacted: true, values } };
};

/**
 * Returns a copy of `report` containing only the public tier: sensitive
 * evidence text is stripped from every row, and `metadata.redactionProfile`
 * is recorded so the applied profile is visible in downstream output.
 */
export const redactEvalReport = (report: EvalReportV1): EvalReportV1 => ({
  ...report,
  run: redactRunConfigSnapshot(report.run),
  rows: report.rows.map(redactEvalRow),
  metadata: {
    ...report.metadata,
    redactionProfile: 'default',
    redacted: true,
  },
});

/**
 * Scans a report for any sensitive-tier field so callers can verify the
 * public tier is clean before publishing (defense in depth alongside
 * `redactEvalReport`).
 */
export const findSensitiveFields = (report: EvalReportV1): string[] => {
  const hits = new Set<string>();

  for (const row of report.rows) {
    for (const field of SENSITIVE_ROW_FIELDS) {
      if (row[field] !== undefined) hits.add(field);
    }
    if (row.turns?.some((turn) => turn.content && turn.content !== REDACTED_PLACEHOLDER)) {
      hits.add('turns[].content');
    }
    if (row.turns?.some((turn) => turn.toolCall?.args && Object.keys(turn.toolCall.args).length > 0)) {
      hits.add('turns[].toolCall.args');
    }
    if (row.turns?.some((turn) => turn.toolResult && turn.toolResult !== REDACTED_PLACEHOLDER)) {
      hits.add('turns[].toolResult');
    }
    if (row.toolCalls?.some((call) => call.args && Object.keys(call.args).length > 0)) {
      hits.add('toolCalls[].args');
    }
    if (row.toolCalls?.some((call) => call.result && call.result !== REDACTED_PLACEHOLDER)) {
      hits.add('toolCalls[].result');
    }
    if (row.trace?.traceUrl !== undefined || row.trace?.spanUrl !== undefined) {
      hits.add('trace.traceUrl/spanUrl');
    }
    if (
      row.metadata &&
      Object.entries(row.metadata).some(([key, value]) => !PUBLIC_METADATA_KEYS.has(key) && value !== REDACTED_PLACEHOLDER)
    ) {
      hits.add('metadata.*');
    }
    if (row.humanReviews?.some((review) => review.note !== undefined || review.reviewer !== REDACTED_PLACEHOLDER)) {
      hits.add('humanReviews[].note/reviewer');
    }
    if (row.checks?.some((check) => check.expected !== undefined || check.actual !== undefined)) {
      hits.add('checks[].expected/actual');
    }
  }

  const configValues = report.run.configSnapshot?.values;
  if (configValues && Object.values(configValues).some((value) => value !== REDACTED_PLACEHOLDER)) {
    hits.add('run.configSnapshot.values');
  }

  return [...hits];
};
