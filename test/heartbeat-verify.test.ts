import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gateRunStatusFromExitCode,
  verifyHeartbeatFile,
  verifyHeartbeatFreshness,
  type CheckHeartbeatPayload,
} from '../src/gates/heartbeat.js';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-heartbeat-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const freshPayload = (overrides: Partial<CheckHeartbeatPayload> = {}): CheckHeartbeatPayload => ({
  schemaVersion: 'eval-check-heartbeat/v1',
  gateRunStatus: 'ran',
  generatedAt: new Date().toISOString(),
  exitCode: 0,
  ...overrides,
});

describe('gateRunStatusFromExitCode', () => {
  it('maps exit codes to gateRunStatus', () => {
    expect(gateRunStatusFromExitCode(0)).toBe('ran');
    expect(gateRunStatusFromExitCode(1)).toBe('ran');
    expect(gateRunStatusFromExitCode(3)).toBe('skipped');
    expect(gateRunStatusFromExitCode(2)).toBe('errored');
    expect(gateRunStatusFromExitCode(99)).toBe('errored');
  });
});

describe('verifyHeartbeatFreshness', () => {
  it('passes for a fresh, ran heartbeat within the window', () => {
    const result = verifyHeartbeatFreshness(freshPayload(), { maxAgeHours: 24 });
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails for a stale heartbeat', () => {
    const stale = freshPayload({
      generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });
    const result = verifyHeartbeatFreshness(stale, { maxAgeHours: 24 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/stale/i);
  });

  it('fails when gateRunStatus is skipped', () => {
    const result = verifyHeartbeatFreshness(freshPayload({ gateRunStatus: 'skipped' }), {
      maxAgeHours: 24,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/skipped/);
  });

  it('fails when gateRunStatus is errored', () => {
    const result = verifyHeartbeatFreshness(
      freshPayload({ gateRunStatus: 'errored', message: 'boom' }),
      { maxAgeHours: 24 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/errored/);
    expect(result.reasons.join('\n')).toMatch(/boom/);
  });

  it('fails for an unparseable timestamp', () => {
    const result = verifyHeartbeatFreshness(freshPayload({ generatedAt: 'not-a-date' }), {
      maxAgeHours: 24,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/not a parseable timestamp/);
  });
});

describe('verifyHeartbeatFile', () => {
  it('fails when the heartbeat file is missing — the deleted-gate-step case', async () => {
    const dir = await createTempDir();
    const missingPath = path.join(dir, 'does-not-exist.json');
    const result = await verifyHeartbeatFile(missingPath, { maxAgeHours: 24 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/No heartbeat file found/);
    expect(result.reasons.join('\n')).toMatch(/skipped, deleted/);
  });

  it('fails when the heartbeat file is malformed JSON', async () => {
    const dir = await createTempDir();
    const heartbeatPath = path.join(dir, 'heartbeat.json');
    await writeFile(heartbeatPath, '{not json', 'utf8');
    const result = await verifyHeartbeatFile(heartbeatPath, { maxAgeHours: 24 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/not valid JSON/);
  });

  it('passes for a real, fresh heartbeat file', async () => {
    const dir = await createTempDir();
    const heartbeatPath = path.join(dir, 'heartbeat.json');
    await writeFile(heartbeatPath, JSON.stringify(freshPayload()), 'utf8');
    const result = await verifyHeartbeatFile(heartbeatPath, { maxAgeHours: 24 });
    expect(result.ok).toBe(true);
  });
});

describe('heartbeat-verify CLI command', () => {
  it('exits 0 for a fresh heartbeat', async () => {
    const dir = await createTempDir();
    const heartbeatPath = path.join(dir, 'heartbeat.json');
    await writeFile(heartbeatPath, JSON.stringify(freshPayload()), 'utf8');

    const { stdout } = await execFileAsync(
      'pnpm',
      ['cli:dev', 'heartbeat-verify', `--heartbeat=${heartbeatPath}`, '--max-age-hours=24'],
      { cwd: process.cwd() },
    );
    expect(stdout).toMatch(/Heartbeat OK/);
  });

  it('exits 1 with an alert-style message when the heartbeat file is missing', async () => {
    const dir = await createTempDir();
    const missingPath = path.join(dir, 'missing-heartbeat.json');

    await expect(
      execFileAsync(
        'pnpm',
        ['cli:dev', 'heartbeat-verify', `--heartbeat=${missingPath}`, '--max-age-hours=24'],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('skipped, deleted'),
    });
  });

  it('exits 1 when the heartbeat is stale', async () => {
    const dir = await createTempDir();
    const heartbeatPath = path.join(dir, 'heartbeat.json');
    await writeFile(
      heartbeatPath,
      JSON.stringify(
        freshPayload({ generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }),
      ),
      'utf8',
    );

    await expect(
      execFileAsync(
        'pnpm',
        ['cli:dev', 'heartbeat-verify', `--heartbeat=${heartbeatPath}`, '--max-age-hours=24'],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('stale'),
    });
  });

  it('exits 2 when required flags are missing', async () => {
    await expect(
      execFileAsync('pnpm', ['cli:dev', 'heartbeat-verify'], { cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it('rejects unknown flags', async () => {
    await expect(
      execFileAsync(
        'pnpm',
        ['cli:dev', 'heartbeat-verify', '--heartbeat=x', '--max-age-hours=24', '--bogus=1'],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({ code: 2 });
  });
});
