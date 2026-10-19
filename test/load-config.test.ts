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

  it('throws instead of silently falling back to defaults when package.json has malformed JSON', async () => {
    await writeFile(
      path.join(dir, 'package.json'),
      '{ "name": "t", "eval-dashboards": { "gates": { "minPassRate": 0.9 } }  invalid\n',
      'utf8',
    );

    await expect(loadConfig(dir)).rejects.toThrow(/Failed to load package.json config/);
  });

  it('loads a well-formed package.json#eval-dashboards config', async () => {
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 't', 'eval-dashboards': { gates: { minPassRate: 0.8 } } }),
      'utf8',
    );

    await expect(loadConfig(dir)).resolves.toEqual({ gates: { minPassRate: 0.8 } });
  });
  it.each(['null', 'false', '[]'])('rejects a malformed default config export: %s', async (value) => {
    await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), `export default ${value};`);
    await expect(loadConfig(dir)).rejects.toThrow(/Config must export an object/);
  });

  it('does not fall through to package.json after an existing config imports a missing module', async () => {
    await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), "import './missing-policy.mjs'; export default { gates: { minPassRate: 1 } };");
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ 'eval-dashboards': { gates: { minPassRate: 0 } } }));
    await expect(loadConfig(dir)).rejects.toThrow(/Failed to load config file/);
  });

  it.each([{ value: null }, { value: false }, { value: [] }])('rejects a malformed package.json config: $value', async ({ value }) => {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ 'eval-dashboards': value }));
    await expect(loadConfig(dir)).rejects.toThrow(/must be an object/);
  });


  it('should fail closed with a suggestion when a gate key is misspelled in the config file', async () => {
    await writeFile(
      path.join(dir, 'eval-dashboards.config.mjs'),
      'export default { gates: { minPassRat: 0.9 } };\n',
      'utf8',
    );

    await expect(loadConfig(dir)).rejects.toThrow(/gates\.minPassRat: not a setting\. Did you mean "minPassRate"\?/);
  });

  it('should fail closed when package.json#eval-dashboards has an unknown key', async () => {
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ 'eval-dashboards': { gatez: {} } }),
      'utf8',
    );

    await expect(loadConfig(dir)).rejects.toThrow(/gatez: not a setting/);
  });
});
