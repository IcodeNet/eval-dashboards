import { readFile } from 'node:fs/promises';
import type { EvalReportV1, EvalRow } from '../model/eval-report-v1.js';

/**
 * A single recorded waiver/exception: a specific known failure (or a whole
 * suite) that is allowed to ship despite failing gates, for a bounded time,
 * with an audit trail (who approved it, why, and the ticket tracking the
 * real fix). Waivers are additive evidence, never a way to silently disable
 * a gate: an expired waiver fails the check instead of falling back to
 * "gate never ran".
 */
export type WaiverV1 = {
  /** Stable identifier for this waiver record (referenced in reports/diagnostics). */
  id: string;
  /** Suite this waiver applies to. */
  suite: string;
  /** Specific row id within the suite. Omit to waive the whole suite's failures. */
  rowId?: string;
  /** Why this failure is acceptable to ship despite the gate. */
  reason: string;
  /** Person/team accountable for the risk being carried (e.g. an email or handle). */
  riskOwner: string;
  /** Tracking reference for the real fix (e.g. JIRA-123, a GitHub issue URL). */
  ticket: string;
  /** ISO-8601 timestamp after which this waiver no longer applies. Required. */
  expiresAt: string;
  /** Optional creation timestamp for audit trail. */
  createdAt?: string;
};

export type WaiverRegisterV1 = {
  schemaVersion: 'eval-waiver-register/v1';
  waivers: WaiverV1[];
};

export const WAIVER_REGISTER_SCHEMA_VERSION = 'eval-waiver-register/v1' as const;

export class WaiverRegisterError extends Error {}

/** Load and minimally validate a waiver register file. Throws on malformed input. */
export const loadWaiverRegister = async (filePath: string): Promise<WaiverRegisterV1> => {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WaiverRegisterError(`Could not read waiver register ${filePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WaiverRegisterError(`Waiver register ${filePath} is not valid JSON: ${message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new WaiverRegisterError(`Waiver register ${filePath} must be a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== WAIVER_REGISTER_SCHEMA_VERSION) {
    throw new WaiverRegisterError(
      `Waiver register ${filePath} has unexpected schemaVersion ${String(record.schemaVersion)}; expected ${WAIVER_REGISTER_SCHEMA_VERSION}.`,
    );
  }

  if (!Array.isArray(record.waivers)) {
    throw new WaiverRegisterError(`Waiver register ${filePath} is missing a "waivers" array.`);
  }

  const waivers: WaiverV1[] = [];
  record.waivers.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new WaiverRegisterError(`Waiver register ${filePath} entry ${index} is not an object.`);
    }
    const item = entry as Record<string, unknown>;
    const required = ['id', 'suite', 'reason', 'riskOwner', 'ticket', 'expiresAt'] as const;
    for (const field of required) {
      if (typeof item[field] !== 'string' || item[field] === '') {
        throw new WaiverRegisterError(
          `Waiver register ${filePath} entry ${index} is missing required string field "${field}".`,
        );
      }
    }
    if (Number.isNaN(Date.parse(item.expiresAt as string))) {
      throw new WaiverRegisterError(
        `Waiver register ${filePath} entry ${index} (id=${String(item.id)}) has an invalid expiresAt date: ${String(item.expiresAt)}.`,
      );
    }
    if (item.rowId !== undefined && typeof item.rowId !== 'string') {
      throw new WaiverRegisterError(
        `Waiver register ${filePath} entry ${index} (id=${String(item.id)}) has a non-string rowId.`,
      );
    }
    waivers.push({
      id: item.id as string,
      suite: item.suite as string,
      rowId: item.rowId as string | undefined,
      reason: item.reason as string,
      riskOwner: item.riskOwner as string,
      ticket: item.ticket as string,
      expiresAt: item.expiresAt as string,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    });
  });

  return { schemaVersion: WAIVER_REGISTER_SCHEMA_VERSION, waivers };
};

export type WaiverApplicationEntry = {
  waiver: WaiverV1;
  /** Row ids (within the waiver's suite) that matched and were waived, if any. */
  matchedRowIds: string[];
};

export type WaiverApplicationResult = {
  /** Report with matched, non-expired waivers' rows marked passed for gating purposes.
   * The original report object is left untouched; this is always a shallow-cloned copy. */
  reportForGating: EvalReportV1;
  /** Waivers currently in effect (not expired) and matching at least one row. */
  active: WaiverApplicationEntry[];
  /** Waivers whose expiresAt is in the past. These always fail the gate, whether
   * or not they still match a failing row, because a lapsed waiver means the
   * carried risk was never re-approved. */
  expired: WaiverApplicationEntry[];
  /** Waivers that are active but did not match any row in this report (e.g. the
   * underlying failure was already fixed, or the id/suite is stale). Surfaced as
   * diagnostics only; not a gate failure. */
   unmatched: WaiverV1[];
  failures: string[];
  diagnostics: string[];
};

const rowMatchesWaiver = (row: EvalRow, waiver: WaiverV1): boolean => {
  if (row.suite !== waiver.suite) return false;
  if (waiver.rowId !== undefined) return row.id === waiver.rowId;
  return true;
};

/**
 * Apply a waiver register against a report ahead of gating. Matched, active
 * (non-expired) waivers cause their rows to be treated as passed for the
 * purposes of `checkGates`/calibration checks — never mutating the original
 * report used for rendering. Expired waivers always produce a gate failure
 * regardless of whether their target row still fails, since the point of an
 * expiry is that the risk must be re-reviewed, not silently extended.
 */
export const applyWaivers = (
  report: EvalReportV1,
  register: WaiverRegisterV1 | undefined,
  now: Date = new Date(),
): WaiverApplicationResult => {
  if (!register || register.waivers.length === 0) {
    return {
      reportForGating: report,
      active: [],
      expired: [],
      unmatched: [],
      failures: [],
      diagnostics: [],
    };
  }

  const active: WaiverApplicationEntry[] = [];
  const expired: WaiverApplicationEntry[] = [];
  const unmatched: WaiverV1[] = [];
  const failures: string[] = [];
  const diagnostics: string[] = [];
  const waivedRowKeys = new Set<string>();

  for (const waiver of register.waivers) {
    const matchedRows = report.rows.filter((row) => rowMatchesWaiver(row, waiver));
    const matchedRowIds = matchedRows.map((row) => row.id);
    const isExpired = Date.parse(waiver.expiresAt) < now.getTime();

    if (isExpired) {
      expired.push({ waiver, matchedRowIds });
      const scope = waiver.rowId ? `${waiver.suite}:${waiver.rowId}` : `suite "${waiver.suite}"`;
      failures.push(
        `Waiver "${waiver.id}" for ${scope} expired on ${waiver.expiresAt} (owner=${waiver.riskOwner}, ticket=${waiver.ticket}); renew or fix before this can ship.`,
      );
      continue;
    }

    if (matchedRows.length === 0) {
      unmatched.push(waiver);
      continue;
    }

    active.push({ waiver, matchedRowIds });
    for (const row of matchedRows) {
      waivedRowKeys.add(`${row.suite}:${row.id}`);
    }
  }

  if (active.length > 0) {
    for (const entry of active) {
      const scope = entry.waiver.rowId
        ? `${entry.waiver.suite}:${entry.waiver.rowId}`
        : `suite "${entry.waiver.suite}" (${entry.matchedRowIds.length} row(s))`;
      diagnostics.push(
        `ACTIVE WAIVER "${entry.waiver.id}" on ${scope}: ${entry.waiver.reason} ` +
          `(owner=${entry.waiver.riskOwner}, ticket=${entry.waiver.ticket}, expires=${entry.waiver.expiresAt}).`,
      );
    }
  }

  for (const waiver of unmatched) {
    diagnostics.push(
      `Waiver "${waiver.id}" (suite=${waiver.suite}${waiver.rowId ? `, row=${waiver.rowId}` : ''}) did not match any row in this run; it may be stale or already fixed.`,
    );
  }

  if (waivedRowKeys.size === 0) {
    return {
      reportForGating: report,
      active,
      expired,
      unmatched,
      failures,
      diagnostics,
    };
  }

  const reportForGating: EvalReportV1 = {
    ...report,
    rows: report.rows.map((row) =>
      waivedRowKeys.has(`${row.suite}:${row.id}`) && !row.passed ? { ...row, passed: true } : row,
    ),
  };

  return { reportForGating, active, expired, unmatched, failures, diagnostics };
};
