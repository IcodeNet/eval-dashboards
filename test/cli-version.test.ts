import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { readPackageVersion } from '../src/cli/package-version.js';

const execFileAsync = promisify(execFile);
const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');

const packageVersion = async (): Promise<string> =>
  (JSON.parse(await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;

describe('eval-dashboards --version', () => {
  it.each(['--version', '-v', 'version'])('should print the package version and exit 0 when run as %s', async (flag) => {
    const result = await execFileAsync('pnpm', ['exec', 'tsx', cliEntry, flag], { cwd: process.cwd() });

    expect(result.stdout.trim()).toBe(await packageVersion());
  });

  it('should read the version from the package above a file in dist/cli when the bundle runs', async () => {
    const fromBundle = path.resolve(process.cwd(), 'dist/cli/index.js');

    expect(await readPackageVersion(fromBundle)).toBe(await packageVersion());
  });

  it('should throw a clear error when no package.json for this package is above the file', async () => {
    await expect(readPackageVersion('/tmp/nowhere/at/all/file.js')).rejects.toThrow(
      'Could not find the @icodenet/eval-dashboards package.json',
    );
  });
});
