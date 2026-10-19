import { execFileSync } from 'node:child_process';

/**
 * Builds the docs site once before any test file runs. Test files run in parallel workers, and two
 * builds writing to the same `dist/` collide, so no test builds it itself.
 */
export default function setup(): void {
  execFileSync('pnpm', ['--filter', '@icodenet/eval-dashboards-docs-site', 'build'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}
