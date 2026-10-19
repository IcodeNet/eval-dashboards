import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseJsonFile, writeJsonFile } from '../io/reports.js';
import type { RunHistoryEntry } from './history.js';

/**
 * Storage adapter for run history. The file store is the default; other
 * backends (for example SQLite) implement the same two methods so the CLI
 * can switch store without changing how history is built or rendered.
 */
export interface HistoryStore {
  /** Entries ordered oldest to newest, as produced by `buildHistory`. */
  read(): Promise<RunHistoryEntry[]>;
  /** Replace the stored history with `entries`. */
  write(entries: RunHistoryEntry[]): Promise<void>;
}

/** Stores history as one `history.json` file, the format `org-rollup` reads. */
export const createFileHistoryStore = (filePath: string): HistoryStore => ({
  async read() {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw Object.assign(
          new Error(`History file ${filePath} was not found. Create it with "eval-dashboards history --out=${filePath}".`),
          { exitCode: 2 },
        );
      }
      throw error;
    }
    const parsed = parseJsonFile(raw, filePath, 'History file');
    if (!Array.isArray(parsed)) {
      throw new Error(`History file ${filePath} must contain a JSON array.`);
    }
    return parsed as RunHistoryEntry[];
  },
  async write(entries) {
    await writeJsonFile(filePath, entries);
  },
});

const SQLITE_EXTENSIONS = new Set(['.sqlite', '.sqlite3', '.db']);

/** Picks the SQLite store for `.sqlite`, `.sqlite3` and `.db` paths and the file store otherwise. */
export const createHistoryStoreForPath = async (filePath: string): Promise<HistoryStore> => {
  if (!SQLITE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return createFileHistoryStore(filePath);
  }
  const { createSqliteHistoryStore } = await import('./sqlite-store.js');
  return createSqliteHistoryStore(filePath);
};
