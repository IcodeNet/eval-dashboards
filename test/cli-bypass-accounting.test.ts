import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-bypass-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const buildReport = (runId: string, generatedAt: string) => ({
  schemaVersion: 'eval-report/v1',
  run: { id: runId, generatedAt },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
});

describe('4F.9 bypass accounting', () => {
  it('records bypassUsage: count 0 in check --json-out when no escape hatches are used', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('r1', '2026-09-15T00:00:00.000Z')), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${inputDir}`, '--min-pass-rate=0', `--json-out=${outPath}`],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      bypassUsage: { count: number; used: string[] };
    };
    expect(payload.bypassUsage.count).toBe(0);
    expect(payload.bypassUsage.used).toEqual([]);
  });

  it('records bypassUsage and appends a bypass-log entry when --allow-blocked-baseline is used', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('r2', '2026-09-15T00:00:00.000Z')), 'utf8');

    const outPath = path.join(dir, 'check-result.json');
    const bypassLogPath = path.join(dir, 'bypass-log.jsonl');
    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        `--input=${inputDir}`,
        '--min-pass-rate=0',
        '--allow-blocked-baseline',
        `--json-out=${outPath}`,
        `--bypass-log=${bypassLogPath}`,
      ],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      bypassUsage: { count: number; used: string[]; flags: { allowBlockedBaseline: boolean } };
    };
    expect(payload.bypassUsage.count).toBe(1);
    expect(payload.bypassUsage.used).toEqual(['allowBlockedBaseline']);
    expect(payload.bypassUsage.flags.allowBlockedBaseline).toBe(true);

    const logRaw = await readFile(bypassLogPath, 'utf8');
    const logLines = logRaw.trim().split('\n');
    expect(logLines).toHaveLength(1);
    const logEntry = JSON.parse(logLines[0]!) as { command: string; count: number; runId: string };
    expect(logEntry.command).toBe('check');
    expect(logEntry.count).toBe(1);
    expect(logEntry.runId).toBe('r2');
  });

  it('joins bypass-log entries into history via history --bypass-log', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport('history-run-1', '2026-09-15T00:00:00.000Z')), 'utf8');

    const bypassLogPath = path.join(dir, 'bypass-log.jsonl');
    await writeFile(
      bypassLogPath,
      `${JSON.stringify({
        schemaVersion: 'eval-bypass-log-entry/v1',
        command: 'check',
        runId: 'history-run-1',
        generatedAt: '2026-09-15T00:00:00.000Z',
        flags: {
          allowBlockedBaseline: true,
          allowStaleCalibration: false,
          allowGateLoosening: false,
          allowSensitivePublish: false,
        },
        used: ['allowBlockedBaseline'],
        count: 1,
      })}\n`,
      'utf8',
    );

    const historyOut = path.join(dir, 'history.json');
    await execFileAsync(
      'pnpm',
      ['cli:dev', 'history', `--input=${inputDir}`, `--out=${historyOut}`, `--bypass-log=${bypassLogPath}`],
      { cwd: process.cwd() },
    );

    const history = JSON.parse(await readFile(historyOut, 'utf8')) as Array<{
      run: { id: string };
      bypassUsage?: { count: number };
    }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.bypassUsage?.count).toBe(1);
  });
});
