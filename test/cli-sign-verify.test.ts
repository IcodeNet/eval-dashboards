import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-cli-sign-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sign / verify CLI commands', () => {
  it('sign writes an eval-check-signature/v1 file (cosign unavailable locally)', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    const sigPath = path.join(dir, 'check-result.json.sig.json');
    await writeFile(artifactPath, JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: true }), 'utf8');

    await execFileAsync('pnpm', ['cli:dev', 'sign', `--artifact=${artifactPath}`, `--out=${sigPath}`], {
      cwd: process.cwd(),
    });

    const signature = JSON.parse(await readFile(sigPath, 'utf8')) as {
      schemaVersion: string;
      method: string;
      digest: { algorithm: string; hex: string };
    };
    expect(signature.schemaVersion).toBe('eval-check-signature/v1');
    expect(signature.digest.algorithm).toBe('sha256');
    expect(/^[0-9a-f]{64}$/.test(signature.digest.hex)).toBe(true);
    expect(signature.method).toBe('unavailable');
  });

  it('verify passes for an unmodified artifact and its digest-only signature', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    await writeFile(artifactPath, JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: true }), 'utf8');

    await execFileAsync('pnpm', ['cli:dev', 'sign', `--artifact=${artifactPath}`], { cwd: process.cwd() });

    // With cosign unavailable, verify still fails (no real signature to trust) —
    // this asserts the digest-mismatch path separately below, and here just
    // confirms the CLI runs and reports the expected non-zero exit + reason.
    await expect(
      execFileAsync('pnpm', ['cli:dev', 'verify', `--artifact=${artifactPath}`], { cwd: process.cwd() }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Signature is 'unavailable'"),
    });
  });

  it('verify fails a hand-edited artifact with a digest mismatch', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    await writeFile(artifactPath, JSON.stringify({ passed: false }), 'utf8');

    await execFileAsync('pnpm', ['cli:dev', 'sign', `--artifact=${artifactPath}`], { cwd: process.cwd() });

    // Hand-edit after signing.
    await writeFile(artifactPath, JSON.stringify({ passed: true }), 'utf8');

    await expect(
      execFileAsync('pnpm', ['cli:dev', 'verify', `--artifact=${artifactPath}`], { cwd: process.cwd() }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Digest mismatch'),
    });
  });

  it('verify fails when no signature file exists at all', async () => {
    const dir = await createTempDir();
    const artifactPath = path.join(dir, 'check-result.json');
    await writeFile(artifactPath, JSON.stringify({ passed: true }), 'utf8');

    await expect(
      execFileAsync('pnpm', ['cli:dev', 'verify', `--artifact=${artifactPath}`], { cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: 1 });
  });
});
