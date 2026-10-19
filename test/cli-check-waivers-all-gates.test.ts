import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const previous = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'before', generatedAt: '2026-10-01T00:00:00.000Z' },
  suites: [{ id: 'safety', total: 2, passed: 2, failed: 0 }],
  rows: [
    { id: 'tone', suite: 'safety', passed: true },
    { id: 'injection-01', suite: 'safety', passed: true },
  ],
};

const current = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'now', generatedAt: '2026-10-02T00:00:00.000Z' },
  suites: [{ id: 'safety', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'safety', passed: true },
    { id: 'injection-01', suite: 'safety', passed: false, severity: 'critical' },
  ],
};

const waiver = (expiresAt: string) => ({
  schemaVersion: 'eval-waiver-register/v1',
  waivers: [
    {
      id: 'w1',
      suite: 'safety',
      rowId: 'injection-01',
      reason: 'known judge miss',
      riskOwner: 'a@example.com',
      ticket: 'T-1',
      expiresAt,
    },
  ],
});

/** Runs `check` with one waived critical failure and the given gate flag; returns the exit code. */
const exitCodeFor = async (gateFlag: string, withWaiver: boolean): Promise<number> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-waiver-gates-'));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'in'), { recursive: true });
  await writeFile(path.join(dir, 'in', 'a.json'), JSON.stringify(previous), 'utf8');
  await writeFile(path.join(dir, 'in', 'b.json'), JSON.stringify(current), 'utf8');
  await writeFile(path.join(dir, 'waivers.json'), JSON.stringify(waiver('2099-01-01T00:00:00.000Z')), 'utf8');
  const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
  const args = ['exec', 'tsx', cliEntry, 'check', '--input=in', gateFlag, ...(withWaiver ? ['--waiver-file=waivers.json'] : [])];
  try {
    await execFileAsync('pnpm', args, { cwd: dir });
    return 0;
  } catch (error) {
    return (error as { code?: number }).code ?? -1;
  }
};

describe('a waived failure and every gate that counts it', () => {
  it.each([
    ['--min-pass-rate=1'],
    ['--zero-critical'],
    ['--max-new-failures=0'],
    ['--require-suite-pass=safety'],
  ])('should fail %s without a waiver and pass it with an active waiver', async (gateFlag) => {
    expect(await exitCodeFor(gateFlag, false)).toBe(1);
    expect(await exitCodeFor(gateFlag, true)).toBe(0);
  });
});
