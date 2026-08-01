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

/** Try to load a config file, returning undefined if none is found. */
const tryImportConfig = async (filePath: string): Promise<EvalReportsConfig | undefined> => {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const config: unknown = mod.default ?? mod;
    if (config && typeof config === 'object') return config as EvalReportsConfig;
    return undefined;
  } catch {
    return undefined;
  }
};

/** Try to read eval-reports config from package.json#eval-reports. */
const tryPackageJsonConfig = async (cwd: string): Promise<EvalReportsConfig | undefined> => {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const config = pkg['eval-reports'];
    if (config && typeof config === 'object') return config as EvalReportsConfig;
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Load config from the first of: eval-reports.config.{ts,js,mjs,cjs}, then
 * package.json#eval-reports. Returns an empty object if nothing is found so
 * callers can always destructure safely.
 */
export const loadConfig = async (cwd = process.cwd()): Promise<EvalReportsConfig> => {
  for (const filename of CONFIG_FILENAMES) {
    const resolved = path.resolve(cwd, filename);
    const config = await tryImportConfig(resolved);
    if (config) return config;
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
