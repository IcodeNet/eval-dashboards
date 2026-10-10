import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const run = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${code ?? 'unknown'}): ${command} ${args.join(' ')}`));
    });
  });
};

const assetSnapshot = async (paths: string[]): Promise<Map<string, string>> => {
  const snapshot = new Map<string, string>();
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ...paths], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  for (const file of tracked) {
    snapshot.set(
      file,
      createHash('sha256').update(await readFile(path.join(repoRoot, file))).digest('hex'),
    );
  }
  return snapshot;
};

const changedAssets = (before: Map<string, string>, after: Map<string, string>): string[] => {
  const files = new Set([...before.keys(), ...after.keys()]);
  return [...files].filter((file) => before.get(file) !== after.get(file)).sort();
};

const main = async (): Promise<void> => {
  /**
   * Screenshot rendering can drift slightly across Linux/Windows due to font and rasterization differences.
   * Keep docs/images drift enforcement for local release prep, but gate CI on report artifacts only.
   */
  const paths = process.env.CI === 'true'
    ? ['eval-report', 'eval-report-dark']
    : ['eval-report', 'eval-report-dark', 'docs/images'];

  const before = await assetSnapshot(paths);
  await run('pnpm', ['assets:regenerate']);
  const changed = changedAssets(before, await assetSnapshot(paths));
  if (changed.length) {
    throw new Error(
      `Release assets were stale and have been regenerated:\n${changed.map((file) => `- ${file}`).join('\n')}`,
    );
  }
  console.log(`Release assets verified: ${before.size} file(s) reproduced without changes.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
