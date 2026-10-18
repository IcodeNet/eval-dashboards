import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RunHistoryEntry } from './history.js';
import type { HistoryStore } from './store.js';

const SCHEMA_VERSION = 2;

/** How long a writer waits for another writer to finish before it fails. */
const BUSY_TIMEOUT_MS = 10_000;

const MISSING_SQLITE_MESSAGE =
  'The SQLite history store needs Node 22.5 or newer (built-in node:sqlite). Use the file store on older Node.';

type SqliteModule = typeof import('node:sqlite');

/** Loaded lazily so the file store keeps working on Node versions without node:sqlite. */
const loadSqlite = async (): Promise<SqliteModule> => {
  try {
    return await import('node:sqlite');
  } catch {
    throw new Error(MISSING_SQLITE_MESSAGE);
  }
};

/**
 * Stores history in one SQLite file. Each run is a row holding the full
 * entry as JSON, with date, branch and suite pulled into indexed columns so
 * range queries do not need to parse every entry. `position` keeps the order
 * entries were written in, so runs with equal timestamps round-trip unchanged.
 */
export const createSqliteHistoryStore = (filePath: string): HistoryStore => ({
  async read() {
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
      const hasPosition = db
        .prepare("SELECT 1 AS found FROM pragma_table_info('runs') WHERE name = 'position'")
        .all().length > 0;
      const order = hasPosition ? 'position' : 'generated_at, run_id';
      const rows = db.prepare(`SELECT entry FROM runs ORDER BY ${order}`).all();
      return rows.map((row) => JSON.parse(String(row.entry)) as RunHistoryEntry);
    } finally {
      db.close();
    }
  },

  async write(entries) {
    const { DatabaseSync } = await loadSqlite();
    await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
    const db = new DatabaseSync(filePath);
    try {
      db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      const hasPosition = db
        .prepare("SELECT 1 AS found FROM pragma_table_info('runs') WHERE name = 'position'")
        .all().length > 0;
      const hasRunsTable = db
        .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'runs'")
        .all().length > 0;
      if (hasRunsTable && !hasPosition) {
        db.exec('DROP TABLE IF EXISTS run_suites; DROP TABLE runs;');
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          position INTEGER NOT NULL,
          generated_at TEXT NOT NULL,
          branch TEXT,
          entry TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_suites (
          run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
          suite TEXT NOT NULL,
          PRIMARY KEY (run_id, suite)
        );
        CREATE INDEX IF NOT EXISTS runs_position ON runs (position);
        CREATE INDEX IF NOT EXISTS runs_generated_at ON runs (generated_at);
        CREATE INDEX IF NOT EXISTS runs_branch ON runs (branch);
        CREATE INDEX IF NOT EXISTS run_suites_suite ON run_suites (suite);
      `);
      db.exec('PRAGMA foreign_keys = ON');
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'schemaVersion',
        String(SCHEMA_VERSION),
      );

      const insertRun = db.prepare(
        'INSERT INTO runs (run_id, position, generated_at, branch, entry) VALUES (?, ?, ?, ?, ?)',
      );
      const insertSuite = db.prepare('INSERT INTO run_suites (run_id, suite) VALUES (?, ?)');

      db.exec('BEGIN');
      try {
        db.exec('DELETE FROM run_suites; DELETE FROM runs;');
        for (const [position, entry] of entries.entries()) {
          const { id, generatedAt, branch } = entry.run;
          insertRun.run(id, position, generatedAt, branch ?? null, JSON.stringify(entry));
          for (const suite of Object.keys(entry.bySuite)) insertSuite.run(id, suite);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      db.close();
    }
  },
});
