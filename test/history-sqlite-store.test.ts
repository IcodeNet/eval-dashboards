import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVAL_REPORT_SCHEMA_VERSION, type EvalReportV1 } from '../src/model/eval-report-v1.js';
import { buildHistory } from '../src/history/history.js';
import { createFileHistoryStore } from '../src/history/store.js';
import { createSqliteHistoryStore } from '../src/history/sqlite-store.js';

const makeReport = (id: string, generatedAt: string, branch: string): EvalReportV1 => ({
  schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
  run: { id, generatedAt, branch },
  suites: [{ id: 'safety', total: 1, passed: 1, failed: 0 }],
  rows: [{ id: 'a', suite: 'safety', passed: true }],
});

const makeEntries = () =>
  buildHistory([
    makeReport('run-2', '2026-10-02T00:00:00Z', 'main'),
    makeReport('run-1', '2026-10-01T00:00:00Z', 'feature'),
  ]);

const makeDbPath = async () =>
  path.join(await mkdtemp(path.join(os.tmpdir(), 'history-sqlite-')), 'nested', 'history.sqlite');

describe('sqlite history store', () => {
  it('should return the same entries in date order when written then read back', async () => {
    const store = createSqliteHistoryStore(await makeDbPath());
    const entries = makeEntries();

    await store.write(entries);

    expect(await store.read()).toEqual(entries);
  });

  it('should replace earlier history when written a second time', async () => {
    const store = createSqliteHistoryStore(await makeDbPath());
    await store.write(makeEntries());

    await store.write(makeEntries().slice(0, 1));

    expect((await store.read()).map((entry) => entry.run.id)).toEqual(['run-1']);
  });

  it('should round-trip identically to the file store when history is copied between them', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'history-copy-'));
    const file = createFileHistoryStore(path.join(dir, 'history.json'));
    const sqlite = createSqliteHistoryStore(path.join(dir, 'history.sqlite'));
    await file.write(makeEntries());

    await sqlite.write(await file.read());

    expect(await sqlite.read()).toEqual(await file.read());
  });

  it('should keep the written order when two runs share the same timestamp', async () => {
    const store = createSqliteHistoryStore(await makeDbPath());
    const tied = [
      ...buildHistory([makeReport('run-b', '2026-01-01T10:00:00Z', 'main')]),
      ...buildHistory([makeReport('run-a', '2026-01-01T10:00:00Z', 'main')]),
    ];

    await store.write(tied);

    expect((await store.read()).map((entry) => entry.run.id)).toEqual(['run-b', 'run-a']);
  });

  it('should read a file written by the first schema version when it has no position column', async () => {
    const dbPath = await makeDbPath();
    const entries = makeEntries();
    await createSqliteHistoryStore(dbPath).write(entries.slice(0, 1));
    const db = new DatabaseSync(dbPath);
    db.exec('DROP INDEX runs_position; ALTER TABLE runs DROP COLUMN position;');
    db.close();

    const read = await createSqliteHistoryStore(dbPath).read();

    expect(read.map((entry) => entry.run.id)).toEqual(['run-1']);
  });

  it('should upgrade a first-version file in place when it is written again', async () => {
    const dbPath = await makeDbPath();
    const entries = makeEntries();
    await createSqliteHistoryStore(dbPath).write(entries);
    const db = new DatabaseSync(dbPath);
    db.exec('DROP INDEX runs_position; ALTER TABLE runs DROP COLUMN position;');
    db.close();

    await createSqliteHistoryStore(dbPath).write(entries);

    expect(await createSqliteHistoryStore(dbPath).read()).toEqual(entries);
  });

  it('should wait for another process instead of failing when the database is locked briefly', async () => {
    const dbPath = await makeDbPath();
    const store = createSqliteHistoryStore(dbPath);
    await store.write(makeEntries());
    const holder = spawn(process.execPath, [
      '-e',
      `const { DatabaseSync } = require('node:sqlite');
       const db = new DatabaseSync(${JSON.stringify(dbPath)});
       db.exec('BEGIN IMMEDIATE');
       console.log('locked');
       setTimeout(() => { db.exec('COMMIT'); db.close(); }, 600);`,
    ]);
    await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));

    await expect(store.write(makeEntries())).resolves.toBeUndefined();

    holder.kill();
  }, 20_000);
});
