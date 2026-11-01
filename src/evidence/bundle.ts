/**
 * 4F.11 — Evidence export bundle.
 *
 * An auditor/examiner handed a release should not have to go spelunking through
 * CI logs, a waiver spreadsheet, and a Slack thread to reconstruct "was this
 * release actually gated, and by what evidence". This module packages the
 * artifacts that already exist elsewhere in the pipeline (the eval report, the
 * gate result, the active waiver set, an optional approval trail, and an
 * optional cosign signature) into a single, self-contained JSON file: every
 * input's exact bytes are embedded verbatim plus a recorded sha256 digest, and
 * the whole bundle carries one top-level digest over those per-file digests.
 * `verifyEvidenceBundle` recomputes both and fails closed on any mismatch, so
 * a bundle can be independently checked without needing access to the
 * original files it was built from.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { redactEvalReport } from '../model/redact.js';

export const EVIDENCE_BUNDLE_SCHEMA_VERSION = 'eval-evidence-bundle/v1' as const;

export type EvidenceEntryRole =
  | 'report'
  | 'checkResult'
  | 'waiverRegister'
  | 'signature'
  | 'bypassLog'
  | 'approvalTrail';

/** One embedded file: exact source bytes (as UTF-8 text) plus its recorded digest. */
export type EvidenceBundleEntry = {
  role: EvidenceEntryRole;
  /** Source path as given on the CLI (informational only; not re-read at verify time). */
  sourcePath: string;
  digest: { algorithm: 'sha256'; hex: string };
  /** Exact file contents, embedded verbatim so the bundle is self-contained. */
  contents: string;
  /** Set when `contents` is a redacted copy of the source file rather than its exact bytes. */
  redacted?: true;
  /** sha256 of the original, unredacted source file, so a holder of the original can match it. */
  sourceDigest?: { algorithm: 'sha256'; hex: string };
};

export type EvidenceBundleV1 = {
  schemaVersion: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  generatedAt: string;
  runId?: string;
  baselineRunId?: string;
  entries: EvidenceBundleEntry[];
  /** sha256 over the sorted `"<role>:<digest.hex>"` lines of every entry, so tampering
   * with the entry list itself (add/remove/swap a digest) is detectable even
   * if each individual entry's own digest still matches its (possibly substituted)
   * contents. */
  bundleDigest: { algorithm: 'sha256'; hex: string };
};

export const sha256HexOf = (contents: string): string =>
  createHash('sha256').update(contents, 'utf8').digest('hex');

const computeBundleDigest = (entries: EvidenceBundleEntry[]): string => {
  const lines = entries
    .map((entry) => `${entry.role}:${entry.digest.hex}`)
    .sort();
  return sha256HexOf(lines.join('\n'));
};

export type EvidenceBundleInput = {
  role: EvidenceEntryRole;
  path: string;
  /** Embed a redacted copy (public tier only). Supported for the `report` role. */
  redact?: boolean;
};

const redactReportContents = (contents: string, path: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot redact ${path}: it is not valid JSON (${message}).`);
  }
  return `${JSON.stringify(redactEvalReport(parsed as Parameters<typeof redactEvalReport>[0]), null, 2)}\n`;
};

/** Read each referenced file, hash it, and embed it verbatim into a digest-manifest bundle. */
export const buildEvidenceBundle = async (
  inputs: EvidenceBundleInput[],
  options: { runId?: string; baselineRunId?: string; generatedAt?: string } = {},
): Promise<EvidenceBundleV1> => {
  const entries: EvidenceBundleEntry[] = [];
  for (const input of inputs) {
    let contents: string;
    try {
      contents = await readFile(input.path, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read evidence file for role "${input.role}" at ${input.path}: ${message}`);
    }
    if (input.redact && input.role !== 'report') {
      throw new Error(`Redaction is only supported for the "report" role, not "${input.role}".`);
    }
    const sourceHex = sha256HexOf(contents);
    const embedded = input.redact ? redactReportContents(contents, input.path) : contents;
    entries.push({
      role: input.role,
      sourcePath: input.path,
      digest: { algorithm: 'sha256', hex: sha256HexOf(embedded) },
      contents: embedded,
      ...(input.redact ? { redacted: true as const, sourceDigest: { algorithm: 'sha256' as const, hex: sourceHex } } : {}),
    });
  }

  return {
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runId: options.runId,
    baselineRunId: options.baselineRunId,
    entries,
    bundleDigest: { algorithm: 'sha256', hex: computeBundleDigest(entries) },
  };
};

export type EvidenceBundleVerifyResult = {
  ok: boolean;
  reasons: string[];
  /** Roles present in the bundle, for a quick completeness glance. */
  roles: EvidenceEntryRole[];
};

const evidenceRoles: readonly EvidenceEntryRole[] = ['report', 'checkResult', 'waiverRegister', 'signature', 'bypassLog', 'approvalTrail'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSha256Digest = (value: unknown): value is { algorithm: 'sha256'; hex: string } =>
  isRecord(value) && value.algorithm === 'sha256' && typeof value.hex === 'string' && /^[0-9a-f]{64}$/.test(value.hex);

/**
 * Independently verify a previously produced bundle: every entry's embedded
 * `contents` must hash to its recorded `digest`, and the recomputed bundle
 * digest over all entries must match the recorded `bundleDigest`. This needs
 * nothing but the bundle file itself — no access to the original source
 * files it was built from.
 */
export const verifyEvidenceBundle = (bundle: unknown): EvidenceBundleVerifyResult => {
  const reasons: string[] = [];
  const roles: EvidenceEntryRole[] = [];
  if (!isRecord(bundle)) {
    return { ok: false, reasons: ['Evidence bundle is not a JSON object.'], roles };
  }
  if (bundle.schemaVersion !== EVIDENCE_BUNDLE_SCHEMA_VERSION) {
    reasons.push(`Unexpected schemaVersion ${JSON.stringify(bundle.schemaVersion)}; expected ${EVIDENCE_BUNDLE_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(bundle.entries)) {
    reasons.push('Evidence bundle is missing an "entries" array.');
    return { ok: false, reasons, roles };
  }

  const validatedEntries: EvidenceBundleEntry[] = [];
  for (const [index, entry] of bundle.entries.entries()) {
    if (!isRecord(entry)) {
      reasons.push(`Entry ${index} is not an object.`);
      continue;
    }
    const role = evidenceRoles.find((role) => role === entry.role);
    if (!role) reasons.push(`Entry ${index} has an unsupported role.`);
    else roles.push(role);
    if (typeof entry.sourcePath !== 'string') reasons.push(`Entry ${index} sourcePath must be a string.`);
    if (typeof entry.contents !== 'string') reasons.push(`Entry ${index} contents must be a string.`);
    if (!isSha256Digest(entry.digest)) reasons.push(`Entry ${index} digest must contain algorithm "sha256" and a 64-character lowercase hex value.`);
    if (!role || typeof entry.sourcePath !== 'string' || typeof entry.contents !== 'string' || !isSha256Digest(entry.digest)) continue;

    validatedEntries.push({ role, sourcePath: entry.sourcePath, contents: entry.contents, digest: entry.digest });
    const actualHex = sha256HexOf(entry.contents);
    if (entry.digest.hex !== actualHex) {
      reasons.push(`Entry ${index} (role=${role}, sourcePath=${entry.sourcePath}) content does not match its recorded digest: expected ${entry.digest.hex} but got ${actualHex}. The embedded contents were tampered with after export.`);
    }
  }

  if (!isSha256Digest(bundle.bundleDigest)) {
    reasons.push('Evidence bundle is missing a valid top-level bundleDigest (algorithm "sha256" and 64-character lowercase hex).');
  } else if (validatedEntries.length === bundle.entries.length) {
    const recomputed = computeBundleDigest(validatedEntries);
    if (bundle.bundleDigest.hex !== recomputed) {
      reasons.push(`Bundle digest mismatch: recorded ${bundle.bundleDigest.hex} but recomputed ${recomputed}. The entry list itself (additions, removals, or a swapped digest) was tampered with after export.`);
    }
  }
  return { ok: reasons.length === 0, reasons, roles };
};

/** Convenience: parse a JSON string entry's contents for callers that need the typed payload. */
export const parseEvidenceEntryJson = <T>(entry: EvidenceBundleEntry): T => JSON.parse(entry.contents) as T;
