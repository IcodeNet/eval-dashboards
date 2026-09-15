import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

/** `eval-check-signature/v1`: a detached signature over a check-result artifact's digest. */
export type CheckSignatureV1 = {
  schemaVersion: 'eval-check-signature/v1';
  /** Path to the artifact that was signed, as given on the CLI (informational only). */
  subjectPath: string;
  /** sha256 digest of the exact bytes that were signed. */
  digest: {
    algorithm: 'sha256';
    hex: string;
  };
  /** How the signature was produced. */
  method: 'cosign-keyless' | 'unavailable';
  /** Set when method === 'cosign-keyless'. Raw cosign bundle contents (base64 signature +
   * certificate + rekor entry), sufficient to identify the producing workflow/repo/commit
   * via the certificate's OIDC issuer/subject (Fulcio) and to look up the Rekor entry. */
  cosignBundle?: string;
  /** Sigstore certificate identity fields extracted from the cosign bundle, when available,
   * so an auditor does not need to shell out to `cosign` themselves to read who signed. */
  identity?: {
    issuer?: string;
    subject?: string;
  };
  /** Non-fatal explanation when method === 'unavailable' (e.g. cosign missing, no CI OIDC token). */
  unavailableReason?: string;
  generatedAt: string;
};

export const sha256HexOfBytes = (contents: Buffer | string): string =>
  createHash('sha256').update(contents).digest('hex');

/** Detect whether the `cosign` binary is on PATH and callable. Never throws. */
export const detectCosignAvailable = async (): Promise<boolean> => {
  try {
    await execFileAsync('cosign', ['version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Extract issuer/subject identity fields from a cosign bundle JSON, when parseable.
 * Best-effort: cosign bundle shape has varied across versions; this reads the
 * common `verificationMaterial.certificate` / cert-based fields defensively.
 */
const extractIdentityFromBundle = (bundleJson: string): { issuer?: string; subject?: string } | undefined => {
  try {
    const parsed = JSON.parse(bundleJson) as Record<string, unknown>;
    // cosign sign-blob --bundle writes a top-level object; identity is not always
    // present in a stable location, so we surface it only if we can find it and
    // otherwise leave it to `cosign verify-blob --certificate-identity-regexp` at
    // verify time, which is the authoritative check.
    const cert = (parsed as { cert?: string }).cert;
    if (typeof cert === 'string') {
      return {};
    }
    return undefined;
  } catch {
    return undefined;
  }
};

export type SignArtifactOptions = {
  /** Path to the check-result artifact to hash and sign. */
  artifactPath: string;
  /** Working directory in which to invoke cosign (defaults to process.cwd()). */
  cwd?: string;
};

/**
 * Hash a check-result artifact and produce a detached `eval-check-signature/v1` record.
 *
 * In CI with a real Sigstore/Fulcio OIDC token available, this shells out to
 * `cosign sign-blob --yes --bundle=<tmp>` (keyless signing) and embeds the resulting
 * bundle. Locally, or wherever `cosign` is missing or keyless signing fails (no CI
 * OIDC token), it gracefully degrades to `method: 'unavailable'` with a reason,
 * rather than fabricating a signature or throwing.
 */
export const signArtifact = async (options: SignArtifactOptions): Promise<CheckSignatureV1> => {
  const { artifactPath } = options;
  const contents = await readFile(artifactPath);
  const digestHex = sha256HexOfBytes(contents);
  const generatedAt = new Date().toISOString();

  const cosignAvailable = await detectCosignAvailable();
  if (!cosignAvailable) {
    return {
      schemaVersion: 'eval-check-signature/v1',
      subjectPath: artifactPath,
      digest: { algorithm: 'sha256', hex: digestHex },
      method: 'unavailable',
      unavailableReason: 'cosign binary not found on PATH; keyless signing requires cosign plus a CI OIDC token.',
      generatedAt,
    };
  }

  const bundlePath = `${artifactPath}.cosign-bundle.tmp.json`;
  try {
    await execFileAsync(
      'cosign',
      ['sign-blob', '--yes', `--bundle=${bundlePath}`, artifactPath],
      { cwd: options.cwd ?? process.cwd(), timeout: 60_000 },
    );
    const bundleContents = await readFile(bundlePath, 'utf8');
    return {
      schemaVersion: 'eval-check-signature/v1',
      subjectPath: artifactPath,
      digest: { algorithm: 'sha256', hex: digestHex },
      method: 'cosign-keyless',
      cosignBundle: bundleContents,
      identity: extractIdentityFromBundle(bundleContents),
      generatedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: 'eval-check-signature/v1',
      subjectPath: artifactPath,
      digest: { algorithm: 'sha256', hex: digestHex },
      method: 'unavailable',
      unavailableReason: `cosign sign-blob failed: ${message}`,
      generatedAt,
    };
  } finally {
    try {
      await access(bundlePath);
      // Bundle contents already captured above; leave file removal to the OS/tmp cleanup
      // to avoid masking the primary result with a secondary unlink failure.
    } catch {
      // bundle was never created; nothing to clean up.
    }
  }
};

export type VerifyArtifactOptions = {
  /** Path to the check-result artifact whose digest/signature is being verified. */
  artifactPath: string;
  /** Path to the `eval-check-signature/v1` file produced by `signArtifact`/`sign` command. */
  signaturePath: string;
  /** Required for cosign-keyless bundles: the certificate identity regexp to enforce
   * (typically the workflow ref URL), passed to `cosign verify-blob --certificate-identity-regexp`. */
  certificateIdentityRegexp?: string;
  /** Required alongside certificateIdentityRegexp: the expected OIDC issuer
   * (e.g. https://token.actions.githubusercontent.com). */
  certificateOidcIssuer?: string;
  cwd?: string;
};

export type VerifyArtifactResult = {
  ok: boolean;
  digestMatches: boolean;
  signaturePresent: boolean;
  signatureMethod: CheckSignatureV1['method'];
  reasons: string[];
};

/**
 * Re-validate a check-result artifact against its recorded digest and detached signature.
 * Fails closed: a hand-edited artifact (digest mismatch) or a missing/`unavailable`
 * signature both fail verification, unless the caller has no signature requirement at all
 * (e.g. local dev), which is surfaced via `signatureMethod: 'unavailable'` + a clear reason
 * rather than a silent pass.
 */
export const verifyArtifact = async (options: VerifyArtifactOptions): Promise<VerifyArtifactResult> => {
  const reasons: string[] = [];
  const contents = await readFile(options.artifactPath);
  const actualDigest = sha256HexOfBytes(contents);

  let signature: CheckSignatureV1;
  try {
    const raw = await readFile(options.signaturePath, 'utf8');
    signature = JSON.parse(raw) as CheckSignatureV1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      digestMatches: false,
      signaturePresent: false,
      signatureMethod: 'unavailable',
      reasons: [`Could not read signature file ${options.signaturePath}: ${message}`],
    };
  }

  if (signature.schemaVersion !== 'eval-check-signature/v1') {
    reasons.push(`Unexpected signature schemaVersion: ${String(signature.schemaVersion)}`);
  }

  const digestMatches = signature.digest?.hex === actualDigest;
  if (!digestMatches) {
    reasons.push(
      `Digest mismatch: artifact sha256 is ${actualDigest} but signature records ${signature.digest?.hex ?? '(none)'}. The artifact was modified after signing.`,
    );
  }

  if (signature.method === 'unavailable') {
    reasons.push(
      `Signature is 'unavailable' (${signature.unavailableReason ?? 'no reason recorded'}); this artifact was never cryptographically signed and cannot be treated as audit evidence.`,
    );
    return { ok: false, digestMatches, signaturePresent: true, signatureMethod: 'unavailable', reasons };
  }

  if (!signature.cosignBundle) {
    reasons.push("Signature method is 'cosign-keyless' but no cosignBundle is present.");
    return { ok: false, digestMatches, signaturePresent: true, signatureMethod: signature.method, reasons };
  }

  const cosignAvailable = await detectCosignAvailable();
  if (!cosignAvailable) {
    reasons.push('cosign binary not found on PATH; cannot cryptographically verify the cosign-keyless bundle.');
    return { ok: false, digestMatches, signaturePresent: true, signatureMethod: signature.method, reasons };
  }

  const bundlePath = `${options.artifactPath}.verify-bundle.tmp.json`;
  const { writeFile, unlink } = await import('node:fs/promises');
  await writeFile(bundlePath, signature.cosignBundle, 'utf8');
  try {
    const args = ['verify-blob', `--bundle=${bundlePath}`];
    if (options.certificateIdentityRegexp) {
      args.push(`--certificate-identity-regexp=${options.certificateIdentityRegexp}`);
    }
    if (options.certificateOidcIssuer) {
      args.push(`--certificate-oidc-issuer=${options.certificateOidcIssuer}`);
    }
    args.push(options.artifactPath);
    await execFileAsync('cosign', args, { cwd: options.cwd ?? process.cwd(), timeout: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reasons.push(`cosign verify-blob failed: ${message}`);
    return { ok: false, digestMatches, signaturePresent: true, signatureMethod: signature.method, reasons };
  } finally {
    try {
      await unlink(bundlePath);
    } catch {
      // best effort cleanup
    }
  }

  const ok = digestMatches && reasons.length === 0;
  return { ok, digestMatches, signaturePresent: true, signatureMethod: signature.method, reasons };
};
