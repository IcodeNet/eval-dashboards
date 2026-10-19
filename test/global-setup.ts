import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Builds the docs site once before any test file runs. Test files run in parallel workers, and two
 * builds writing to the same `dist/` collide, so no test builds it itself.
 */
export default function setup(): void {
  // Astro caches rendered Markdown, so a stale cache could hide a plugin change.
  for (const dir of ['dist', '.astro', 'node_modules/.astro']) {
    rmSync(path.resolve(process.cwd(), 'docs-site', dir), { recursive: true, force: true });
  }
  execFileSync('pnpm', ['--filter', '@icodenet/eval-dashboards-docs-site', 'build'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}
