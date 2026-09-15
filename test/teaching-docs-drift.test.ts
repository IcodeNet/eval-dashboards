import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx');
const verifier = path.join(repoRoot, 'scripts/verify-teaching-docs.ts');

/**
 * Guards the teaching docs against output drift.
 *
 * The exercises chain together and each documents the CLI output a learner
 * should see. Those blocks are hand-written, so they rot silently whenever gate
 * diagnostics, lint rules or row counts change. A 2026-09-15 audit found five
 * docs stating output the CLI never produced — including Exercise 10 claiming
 * "Eval gates passed." when the gate actually exits 1.
 *
 * Scoped to --exercises-only: the exercise docs replay in a private scratch
 * dir, whereas the labs regenerate tracked fixtures in examples/ and write to
 * the repo's .tmp/. Mutating the checkout from inside the test suite would race
 * with other tests. Labs are covered by `pnpm teach:verify`, which runs in
 * `pnpm check` and is listed in CHECKS_LEDGER.md.
 */
describe('teaching exercise docs match real CLI output', () => {
  it('replays the exercise chain and finds no drift', async () => {
    const { stdout } = await execFileAsync(tsxBin, [verifier, '--exercises-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(stdout).toContain('Teaching docs verified');
  }, 240_000);
});
