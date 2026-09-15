import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EvalReportsConfig } from './config.js';

const CONFIG_FILENAMES = [
  'eval-dashboards.config.ts',
  'eval-dashboards.config.js',
  'eval-dashboards.config.mjs',
  'eval-dashboards.config.cjs',
];

type ImportConfigResult =
  | { found: false }
  | { found: true; config: EvalReportsConfig; error?: Error };

/**
 * Try to load a config file. Returns `{ found: false }` only when the file
 * genuinely does not exist, so the caller can fall through to the next
 * candidate filename. Any other load failure (syntax error, a throw inside
 * the config module, a bad transform) means the file exists but is broken,
 * and must NOT be treated the same as "no config" — that would silently
 * drop configured gates and let a misconfigured run pass CI green.
 */
const tryImportConfig = async (filePath: string): Promise<ImportConfigResult> => {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const config: unknown = mod.default ?? mod;
    if (config && typeof config === 'object') return { found: true, config: config as EvalReportsConfig };
    return { found: false };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string };
    const isMissingFile =
      err?.code === 'ERR_MODULE_NOT_FOUND' ||
      err?.code === 'MODULE_NOT_FOUND' ||
      err?.code === 'ENOENT';
    if (isMissingFile) return { found: false };
    return { found: true, config: {}, error: error as Error };
  }
};

/** Try to read eval-dashboards config from package.json#eval-dashboards. */
const tryPackageJsonConfig = async (cwd: string): Promise<EvalReportsConfig | undefined> => {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const config = pkg['eval-dashboards'];
    if (config && typeof config === 'object') return config as EvalReportsConfig;
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Load config from the first of: eval-dashboards.config.{ts,js,mjs,cjs}, then
 * package.json#eval-dashboards. Returns an empty object if nothing is found so
 * callers can always destructure safely.
 */
export const loadConfig = async (cwd = process.cwd()): Promise<EvalReportsConfig> => {
  for (const filename of CONFIG_FILENAMES) {
    const resolved = path.resolve(cwd, filename);
    const result = await tryImportConfig(resolved);
    if (result.found && result.error) {
      throw new Error(
        `Failed to load config file ${resolved}: ${result.error.message}\n` +
          'Fix the syntax/runtime error in this file, or remove it, before running eval-dashboards. ' +
          'A broken config file is never treated as "no config", because that would silently drop configured gates.',
      );
    }
    if (result.found) return result.config;
  }

  return (await tryPackageJsonConfig(cwd)) ?? {};
};

/** Merge CLI-supplied overrides on top of a loaded config. CLI wins. */
export const mergeConfig = (
  base: EvalReportsConfig,
  overrides: Partial<EvalReportsConfig>,
): EvalReportsConfig => ({
  ...base,
  ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
});
