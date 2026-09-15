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
};

export type EvidenceBundleV1 = {
  schemaVersion: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  generatedAt: string;
  runId?: string;
  baselineRunId?: string;
  entries: EvidenceBundleEntry[];
  /** sha256 over the sorted `"<role>:<digest.hex>"` lines of every entry, so tampering
   * with the entry list itself (add/remove/reorder/swap a digest) is detectable even
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
};

/** Read each referenced file, hash it, and embed it verbatim into a signed-manifest bundle. */
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
    entries.push({
      role: input.role,
      sourcePath: input.path,
      digest: { algorithm: 'sha256', hex: sha256HexOf(contents) },
      contents,
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

/**
 * Independently verify a previously produced bundle: every entry's embedded
 * `contents` must hash to its recorded `digest`, and the recomputed bundle
 * digest over all entries must match the recorded `bundleDigest`. This needs
 * nothing but the bundle file itself — no access to the original source
 * files it was built from.
 */
export const verifyEvidenceBundle = (bundle: unknown): EvidenceBundleVerifyResult => {
  const reasons: string[] = [];

  if (typeof bundle !== 'object' || bundle === null) {
    return { ok: false, reasons: ['Evidence bundle is not a JSON object.'], roles: [] };
  }
  const record = bundle as Partial<EvidenceBundleV1>;

  if (record.schemaVersion !== EVIDENCE_BUNDLE_SCHEMA_VERSION) {
    reasons.push(
      `Unexpected schemaVersion ${JSON.stringify(record.schemaVersion)}; expected ${EVIDENCE_BUNDLE_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(record.entries)) {
    reasons.push('Evidence bundle is missing an "entries" array.');
    return { ok: false, reasons, roles: [] };
  }

  const entries = record.entries as EvidenceBundleEntry[];
  const roles: EvidenceEntryRole[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object') {
      reasons.push(`Entry ${index} is not an object.`);
      continue;
    }
    roles.push(entry.role);
    const actualHex = sha256HexOf(entry.contents ?? '');
    if (entry.digest?.hex !== actualHex) {
      reasons.push(
        `Entry ${index} (role=${String(entry.role)}, sourcePath=${String(entry.sourcePath)}) content does not match its recorded digest: expected ${String(entry.digest?.hex)} but got ${actualHex}. The embedded contents were tampered with after export.`,
      );
    }
  }

  if (!record.bundleDigest || typeof record.bundleDigest.hex !== 'string') {
    reasons.push('Evidence bundle is missing a top-level bundleDigest.');
  } else {
    const recomputed = computeBundleDigest(entries);
    if (record.bundleDigest.hex !== recomputed) {
      reasons.push(
        `Bundle digest mismatch: recorded ${record.bundleDigest.hex} but recomputed ${recomputed}. The entry list itself (additions, removals, reordering, or a swapped digest) was tampered with after export.`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons, roles };
};

/** Convenience: parse a JSON string entry's contents for callers that need the typed payload. */
export const parseEvidenceEntryJson = <T>(entry: EvidenceBundleEntry): T => JSON.parse(entry.contents) as T;
