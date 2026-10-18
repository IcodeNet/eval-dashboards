import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertKnownFlags, parseArgs, UnknownFlagError } from '../src/cli/args.js';

const execFileAsync = promisify(execFile);
const fixtureInput = 'examples/screenshot-fixture/.evals_output';

const runCli = (args: string[]) => execFileAsync('pnpm', ['cli:dev', ...args], { cwd: process.cwd() });

describe('history stores through the CLI', () => {
  it('should write byte-identical history.json when history is built to SQLite then converted back', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-history-store-'));
    const direct = path.join(dir, 'direct.json');
    const sqlite = path.join(dir, 'history.sqlite');
    const exported = path.join(dir, 'exported.json');

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
