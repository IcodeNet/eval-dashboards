import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const runCli = (args: string[]) => execFileAsync('pnpm', ['cli:dev', ...args], { cwd: process.cwd() });

const makeReport = (runId: string, generatedAt: string, branch: string) => ({
  schemaVersion: 'eval-report/v1',
  run: { id: runId, generatedAt, branch },
  suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
  rows: [{ id: 'tone', suite: 'quality', passed: true }],
});

const buildHistoryFile = async (dir: string, outName: string) => {
  const inputDir = path.join(dir, 'input');
  await mkdir(inputDir, { recursive: true });
  const runs: Array<[string, string, string]> = [
    ['run-1', '2026-01-01T00:00:00.000Z', 'main'],
    ['run-2', '2026-02-01T00:00:00.000Z', 'feature'],
    ['run-3', '2026-03-01T00:00:00.000Z', 'main'],
  ];
  for (const [id, at, branch] of runs) {
    await writeFile(path.join(inputDir, `${id}.json`), JSON.stringify(makeReport(id, at, branch)));
  }
  const historyPath = path.join(dir, outName);
  await runCli(['history', `--input=${inputDir}`, `--out=${historyPath}`]);
  return historyPath;
};

describe('history-report command', () => {
  it('should render only matching runs when branch is set', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-report-'));
    const historyPath = await buildHistoryFile(dir, 'history.json');
    const out = path.join(dir, 'trend.html');

    await runCli(['history-report', `--input=${historyPath}`, `--out=${out}`, '--branch=main']);

    const html = await readFile(out, 'utf8');
    expect(html).toContain('run-1');
    expect(html).toContain('run-3');
    expect(html).not.toContain('run-2');
  }, 60_000);

  it('should read a SQLite store and prune it to a new file when retention is set', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-report-'));
    const sqlitePath = await buildHistoryFile(dir, 'history.sqlite');
    const prunedPath = path.join(dir, 'pruned.json');

    await runCli([
      'history-report',
      `--input=${sqlitePath}`,
      `--out=${path.join(dir, 'trend.html')}`,
      '--keep-last=1',
      `--prune-to=${prunedPath}`,
    ]);

    const pruned = JSON.parse(await readFile(prunedPath, 'utf8')) as Array<{ run: { id: string } }>;
    expect(pruned.map((entry) => entry.run.id)).toEqual(['run-3']);
  }, 60_000);

  it('should fail with a clear message when keep-last is not a number', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-report-'));
    const historyPath = await buildHistoryFile(dir, 'history.json');

    await expect(
      runCli(['history-report', `--input=${historyPath}`, '--keep-last=many']),
    ).rejects.toThrow('--keep-last must be a number');
  }, 60_000);

  it('should fail with a clear message when input is missing', async () => {
    await expect(runCli(['history-report'])).rejects.toThrow('history-report requires --input=<path>');
  }, 60_000);
});
