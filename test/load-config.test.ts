import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/load-config.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-load-config-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty config when no config file or package.json field is present', async () => {
    await expect(loadConfig(dir)).resolves.toEqual({});
  });

  it('loads a well-formed eval-dashboards.config.ts', async () => {
    await writeFile(
      path.join(dir, 'eval-dashboards.config.ts'),
      'export default { gates: { minPassRate: 0.9 } };\n',
      'utf8',
    );

    await expect(loadConfig(dir)).resolves.toEqual({ gates: { minPassRate: 0.9 } });
  });

  it('throws instead of silently falling back to defaults when the config file has a syntax error', async () => {
    await writeFile(
      path.join(dir, 'eval-dashboards.config.ts'),
      'export default { gates: { minPassRate\n', // unterminated object literal
      'utf8',
    );

    await expect(loadConfig(dir)).rejects.toThrow(/Failed to load config file/);
  });

  it('throws instead of silently falling back to defaults when the config module throws at import time', async () => {
    await writeFile(
      path.join(dir, 'eval-dashboards.config.ts'),
      "throw new Error('boom');\n",
      'utf8',
    );

    await expect(loadConfig(dir)).rejects.toThrow(/Failed to load config file/);
  });
});
