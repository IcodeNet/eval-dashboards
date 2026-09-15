import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx');
const verifier = path.join(repoRoot, 'scripts/verify-teaching-docs.ts');

/**
 * Guards docs/teach-exercises/ against output drift.
 *
 * The exercises chain together and each documents the CLI output a learner
 * should see. Those blocks are hand-written, so they rot silently whenever gate
 * diagnostics, lint rules or row counts change. A 2026-09-15 audit found four
 * exercises documenting output the CLI never produced — including Exercise 10
 * claiming "Eval gates passed." when the gate actually exits 1.
 *
 * This replays the chain against the real CLI and fails on any documented line
 * the CLI did not print.
 */
describe('teaching exercise docs match real CLI output', () => {
  it('replays the exercise chain and finds no drift', async () => {
    const { stdout } = await execFileAsync(tsxBin, [verifier], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(stdout).toContain('Teaching docs verified');
  }, 240_000);
});
