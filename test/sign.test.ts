import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { signArtifact, verifyArtifact, sha256HexOfBytes } from '../src/sign/sign.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-sign-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('signArtifact (cosign not installed in this sandbox)', () => {
  it('gracefully degrades to method: unavailable and still records the correct digest', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    const contents = JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: true });
    await writeFile(artifactPath, contents, 'utf8');

    const signature = await signArtifact({ artifactPath });

    expect(signature.schemaVersion).toBe('eval-check-signature/v1');
    expect(signature.digest.algorithm).toBe('sha256');
    expect(signature.digest.hex).toBe(sha256HexOfBytes(contents));
    expect(signature.method).toBe('unavailable');
    expect(signature.unavailableReason).toMatch(/cosign/i);
    expect(signature.cosignBundle).toBeUndefined();
  });
});

describe('verifyArtifact', () => {
  it('fails a hand-edited artifact: digest no longer matches the signature', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    const signaturePath = path.join(dir, 'check-result.json.sig.json');

    await writeFile(artifactPath, JSON.stringify({ passed: false }), 'utf8');
    const signature = await signArtifact({ artifactPath });
    await writeFile(signaturePath, JSON.stringify(signature), 'utf8');

    // Hand-edit the artifact after signing, e.g. flipping passed: false -> true.
    await writeFile(artifactPath, JSON.stringify({ passed: true }), 'utf8');

    const result = await verifyArtifact({ artifactPath, signaturePath });

    expect(result.ok).toBe(false);
    expect(result.digestMatches).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Digest mismatch'))).toBe(true);
  });

  it('fails when the signature method is unavailable, even if the digest matches', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    const signaturePath = path.join(dir, 'check-result.json.sig.json');

    await writeFile(artifactPath, JSON.stringify({ passed: true }), 'utf8');
    const signature = await signArtifact({ artifactPath });
    await writeFile(signaturePath, JSON.stringify(signature), 'utf8');

    const result = await verifyArtifact({ artifactPath, signaturePath });

    expect(signature.method).toBe('unavailable');
    expect(result.digestMatches).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("Signature is 'unavailable'"))).toBe(true);
  });

  it('fails when the signature file is missing', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    await writeFile(artifactPath, JSON.stringify({ passed: true }), 'utf8');

    const result = await verifyArtifact({
      artifactPath,
      signaturePath: path.join(dir, 'does-not-exist.sig.json'),
    });

    expect(result.ok).toBe(false);
    expect(result.signaturePresent).toBe(false);
  });
});
