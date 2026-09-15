import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-check-json-v2-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('check --json-v2-out (eval-check-result/v2)', () => {
  it('writes v2 provenance payload alongside unchanged v1 payload', async () => {
    const dir = await createTempDir();
    const v1Path = path.join(dir, 'check-result.json');
    const v2Path = path.join(dir, 'check-result.v2.json');

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        '--input=examples/agent-quality-preset/artifacts',
        '--min-pass-rate=0.1',
        `--json-out=${v1Path}`,
        `--json-v2-out=${v2Path}`,
      ],
      { cwd: process.cwd(), env: { ...process.env, GITHUB_ACTIONS: undefined, CI: undefined } },
    );

    const v1 = JSON.parse(await readFile(v1Path, 'utf8')) as Record<string, unknown>;
    expect(v1.schemaVersion).toBe('eval-check-result/v1');
    expect(v1).not.toHaveProperty('resolvedGateConfig');
    expect(v1).not.toHaveProperty('artifactDigests');

    const v2 = JSON.parse(await readFile(v2Path, 'utf8')) as {
      schemaVersion: string;
      gateRunStatus: string;
      passed: boolean;
      runId: string;
      resolvedGateConfig: { minPassRate?: number };
      suiteProvenance: Array<{ suite: string; datasetVersion?: string; rubricVersion?: string }>;
      artifactDigests: Array<{ path: string; sha256: string }>;
      subject: { commit?: string; release?: string };
      ciEnvironment: { provider?: string };
    };

    expect(v2.schemaVersion).toBe('eval-check-result/v2');
    expect(v2.gateRunStatus).toBe('ran');
    expect(v2.passed).toBe(true);
    expect(v2.runId).toBe('agent-quality-template-001');
    expect(v2.resolvedGateConfig.minPassRate).toBe(0.1);
    expect(v2.suiteProvenance.length).toBeGreaterThan(0);
    expect(v2.suiteProvenance.every((entry) => typeof entry.suite === 'string')).toBe(true);
    expect(v2.artifactDigests.length).toBeGreaterThan(0);
    expect(v2.artifactDigests.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256))).toBe(true);
    expect(v2.subject).toBeDefined();
    expect(v2.ciEnvironment).toBeDefined();

    // Same underlying fields as v1, minus schemaVersion, are identical.
    expect(v2.passed).toBe(v1.passed);
    expect(v2.runId).toBe(v1.runId);
  });

  it('does not require --json-v2-out; v1-only output is unaffected', async () => {
    const dir = await createTempDir();
    const v1Path = path.join(dir, 'check-result.json');

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        '--input=examples/agent-quality-preset/artifacts',
        '--min-pass-rate=0.1',
        `--json-out=${v1Path}`,
      ],
      { cwd: process.cwd() },
    );

    const v1 = JSON.parse(await readFile(v1Path, 'utf8')) as { schemaVersion: string };
    expect(v1.schemaVersion).toBe('eval-check-result/v1');
  });
});
