import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertKnownFlags, parseArgs, UnknownFlagError } from '../src/cli/args.js';

const execFileAsync = promisify(execFile);

const makeReport = (runId: string, generatedAt: string, branch: string) => ({
  schemaVersion: 'eval-report/v1',
  run: { id: runId, generatedAt, branch },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
});

const makeInputDir = async (dir: string) => {
  const inputDir = path.join(dir, 'input');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, 'run-1.json'), JSON.stringify(makeReport('run-1', '2026-10-01T00:00:00.000Z', 'main')));
  await writeFile(path.join(inputDir, 'run-2.json'), JSON.stringify(makeReport('run-2', '2026-10-02T00:00:00.000Z', 'feature')));
  return inputDir;
};

const runCli = (args: string[]) => execFileAsync('pnpm', ['cli:dev', ...args], { cwd: process.cwd() });

describe('history stores through the CLI', () => {
  it('should write byte-identical history.json when history is built to SQLite then converted back', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-store-'));
    const direct = path.join(dir, 'direct.json');
    const sqlite = path.join(dir, 'history.sqlite');
    const exported = path.join(dir, 'exported.json');
    const fixtureInput = await makeInputDir(dir);

    await runCli(['history', `--input=${fixtureInput}`, `--out=${direct}`]);
    await runCli(['history', `--input=${fixtureInput}`, `--out=${sqlite}`]);
    await runCli(['history-convert', `--input=${sqlite}`, `--out=${exported}`]);

    expect(await readFile(exported, 'utf8')).toBe(await readFile(direct, 'utf8'));
  }, 60_000);

  it('should write byte-identical history.json when JSON is imported to SQLite then exported', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-store-'));
    const original = path.join(dir, 'original.json');
    const sqlite = path.join(dir, 'imported.db');
    const exported = path.join(dir, 'exported.json');
    const fixtureInput = await makeInputDir(dir);

    await runCli(['history', `--input=${fixtureInput}`, `--out=${original}`]);
    await runCli(['history-convert', `--input=${original}`, `--out=${sqlite}`]);
    await runCli(['history-convert', `--input=${sqlite}`, `--out=${exported}`]);

    expect(await readFile(exported, 'utf8')).toBe(await readFile(original, 'utf8'));
  }, 60_000);

  it('should fail with a clear message when history-convert is missing --out', async () => {
    await expect(runCli(['history-convert', '--input=missing.json'])).rejects.toThrow(
      'history-convert requires both --input=<path> and --out=<path>',
    );
  }, 60_000);
});

describe('history-convert flags', () => {
  it('should accept --input and --out when validating flags', () => {
    expect(() => assertKnownFlags(parseArgs(['history-convert', '--input=a.json', '--out=b.sqlite']))).not.toThrow();
  });

  it('should reject an unknown flag when validating history-convert', () => {
    expect(() => assertKnownFlags(parseArgs(['history-convert', '--bogus=1']))).toThrow(UnknownFlagError);
  });
});
