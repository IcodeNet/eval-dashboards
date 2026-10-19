import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads this package's version from the nearest `package.json` above the running file, so the
 * source tree (`src/cli`) and the built bundle (`dist/cli`) both resolve it.
 */
export const readPackageVersion = async (fromFile: string = fileURLToPath(import.meta.url)): Promise<string> => {
  let dir = path.dirname(fromFile);
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: string; version?: string };
      if (pkg.name === '@icodenet/eval-dashboards' && pkg.version) return pkg.version;
    } catch {
      // keep walking up
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find the @icodenet/eval-dashboards package.json to read the version from.');
};
