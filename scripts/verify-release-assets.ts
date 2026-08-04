import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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

const main = async (): Promise<void> => {
  await run('pnpm', ['assets:regenerate']);

  /**
   * Screenshot rendering can drift slightly across Linux/Windows due to font and rasterization differences.
   * Keep docs/images drift enforcement for local release prep, but gate CI on report artifacts only.
   */
  const paths = process.env.CI === 'true'
    ? ['eval-report', 'eval-report-dark']
    : ['eval-report', 'eval-report-dark', 'docs/images'];

  await run('git', ['diff', '--exit-code', '--', ...paths]);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
