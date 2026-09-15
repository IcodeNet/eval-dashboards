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
] as const satisfies ReadonlyArray<keyof EvalRow>;

export const REDACTED_PLACEHOLDER = '[redacted]';

const redactRowMetadata = (metadata?: RowMetadata): RowMetadata | undefined => {
  if (!metadata) return metadata;
  return metadata;
};

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
      // content and toolResult are raw evidence text; the tool name/args
      // shape is kept as it is typically non-sensitive routing metadata.
      content: REDACTED_PLACEHOLDER,
      ...(turn.toolCall ? { toolCall: turn.toolCall } : {}),
    }));
  }

  if (redacted.toolCalls) {
    redacted.toolCalls = redacted.toolCalls.map((call) => ({
      name: call.name,
      args: call.args,
      durationMs: call.durationMs,
      resultIsError: call.resultIsError,
      ...(call.result !== undefined ? { result: REDACTED_PLACEHOLDER } : {}),
    }));
  }

  redacted.metadata = redactRowMetadata(redacted.metadata);

  return redacted;
};

/**
 * Returns a copy of `report` containing only the public tier: sensitive
 * evidence text is stripped from every row, and `metadata.redactionProfile`
 * is recorded so the applied profile is visible in downstream output.
 */
export const redactEvalReport = (report: EvalReportV1): EvalReportV1 => ({
  ...report,
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
    if (row.toolCalls?.some((call) => call.result && call.result !== REDACTED_PLACEHOLDER)) {
      hits.add('toolCalls[].result');
    }
  }

  return [...hits];
};
