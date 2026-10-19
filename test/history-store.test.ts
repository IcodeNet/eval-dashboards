import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVAL_REPORT_SCHEMA_VERSION } from '../src/model/eval-report-v1.js';
import { buildHistory } from '../src/history/history.js';
import { createFileHistoryStore } from '../src/history/store.js';

const makeEntries = () =>
  buildHistory([
    {
      schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
      run: { id: 'run-1', generatedAt: '2026-10-01T00:00:00Z' },
      suites: [{ id: 'safety', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'a', suite: 'safety', passed: true }],
    },
  ]);

describe('file history store', () => {
  it('should return the same entries when written then read back', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-store-'));
    const store = createFileHistoryStore(path.join(dir, 'history.json'));
    const entries = makeEntries();

    await store.write(entries);

    expect(await store.read()).toEqual(entries);
  });

  it('should end the file with a newline when saving history', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-store-'));
    const file = path.join(dir, 'history.json');

    await createFileHistoryStore(file).write(makeEntries());

    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('should reject a history file when it is not a JSON array', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-store-'));
    const file = path.join(dir, 'history.json');
    await writeFile(file, '{"runs":[]}');

    await expect(createFileHistoryStore(file).read()).rejects.toThrow('must contain a JSON array');
  });
});

describe('file history store with a corrupt file', () => {
  it('should name the file and the fix when history.json is not valid JSON', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-store-'));
    const file = path.join(dir, 'history.json');
    await writeFile(file, '{"bad', 'utf8');

    await expect(createFileHistoryStore(file).read()).rejects.toMatchObject({
      message: expect.stringContaining(`History file ${file} is not valid JSON`),
      exitCode: 2,
    });
  });
});

describe('file history store with a missing file', () => {
  it('should say the file was not found and how to create it when history.json is missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-store-'));
    const file = path.join(dir, 'history.json');

    await expect(createFileHistoryStore(file).read()).rejects.toMatchObject({
      message: expect.stringContaining(`History file ${file} was not found`),
      exitCode: 2,
    });
  });
});
