#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredChecks = [
  'check',
  'schema:check',
  'verify:cli',
  'verify:package',
  'assets:verify',
  'audit:ci',
];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

export function snapshot(root) {
  // A check of a mixed working tree is not evidence for the staged commit.
  if (spawnSync('git', ['diff', '--quiet'], { cwd: root }).status !== 0) {
    throw new Error('Unstaged tracked changes exist. Stage the intended complete change before recording evidence.');
  }
  if (git(root, ['ls-files', '--others', '--exclude-standard'])) {
    throw new Error('Untracked files exist. Stage intended files or move scratch files outside the repository.');
  }
  if (git(root, ['ls-files', '--unmerged'])) throw new Error('Resolve merge conflicts first.');
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return { tree: git(root, ['write-tree']), head: head.status === 0 ? head.stdout.trim() : null };
}

function evidenceDir(root) {
  const dir = path.resolve(root, git(root, ['rev-parse', '--git-path', 'quality-evidence']));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const same = (a, b) => a?.tree === b.tree && a?.head === b.head;

export function validateReview(root, review, current) {
  if (!same(review, current)) throw new Error('Review is stale or missing the current tree/head.');
  if (review.verdict !== 'pass' || typeof review.reviewer !== 'string' || !review.reviewer.trim()) {
    throw new Error('Review must name its reviewer and have verdict: pass.');
  }
  if (!Array.isArray(review.findings) || review.findings.some((f) => f.status !== 'resolved')) {
    throw new Error('Review must include findings: [] or findings with status: resolved.');
  }
  if (!Array.isArray(review.claims) || review.claims.length === 0) throw new Error('Review needs evidence-backed claims.');
  for (const claim of review.claims) {
    if (typeof claim.claim !== 'string' || !claim.claim.trim() || !Array.isArray(claim.evidence) || !claim.evidence.length) {
      throw new Error('Each claim needs text and evidence references.');
    }
    for (const ref of claim.evidence) {
      if (typeof ref.path !== 'string' || path.isAbsolute(ref.path) || ref.path.split(/[\\/]/).includes('..')) {
        throw new Error('Evidence paths must stay inside the repository.');
      }
      // Read the staged blob, never a different working-tree version or external symlink.
      const blob = git(root, ['show', `${current.tree}:${ref.path}`]);
      if (!Number.isInteger(ref.line) || ref.line < 1 || ref.line > blob.split('\n').length) {
        throw new Error(`Invalid evidence line: ${ref.path}:${ref.line}`);
      }
    }
  }
}

export function verifyEvidence(root) {
  const current = snapshot(root);
  const dir = evidenceDir(root);
  const quality = read(path.join(dir, 'checks.json'));
  if (!same(quality, current)) throw new Error('Quality checks are stale. Run pnpm quality:record again.');
  for (const command of requiredChecks) {
    const result = quality.results?.find((r) => r.command === command);
    if (!result || result.exitCode !== 0 || result.log !== `${command.replaceAll(':', '-')}.log`) {
      throw new Error(`Missing successful check: pnpm ${command}`);
    }
    if (hash(fs.readFileSync(path.join(dir, result.log))) !== result.sha256) {
      throw new Error(`Check log changed: ${command}`);
    }
  }
  validateReview(root, read(path.join(dir, 'review.json')), current);
  return current;
}

export function recordChecks(root) {
  const current = snapshot(root);
  const dir = evidenceDir(root);
  // Invalidate an earlier success before launching anything that can fail.
  const record = { ...current, recordedAt: new Date().toISOString(), results: [] };
  write(path.join(dir, 'checks.json'), record);
  for (const command of requiredChecks) {
    const log = `${command.replaceAll(':', '-')}.log`;
    const fd = fs.openSync(path.join(dir, log), 'w');
    console.log(`Running pnpm ${command}; log: ${path.join(dir, log)}`);
    let result;
    try { result = spawnSync('pnpm', [command], { cwd: root, stdio: ['ignore', fd, fd] }); }
    finally { fs.closeSync(fd); }
    record.results.push({ command, exitCode: result.status, log, sha256: hash(fs.readFileSync(path.join(dir, log))) });
    write(path.join(dir, 'checks.json'), record);
    if (result.status !== 0) throw new Error(`pnpm ${command} failed; inspect ${path.join(dir, log)}`);
    if (!same(snapshot(root), current)) throw new Error('Files changed during checks. Re-stage, review, and rerun checks.');
  }
  console.log('Checks passed for staged tree ' + current.tree);
}

export function main(args, cwd = process.cwd()) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const [action, file] = args;
  if (action === 'snapshot') console.log(JSON.stringify(snapshot(root), null, 2));
  else if (action === 'check') recordChecks(root);
  else if (action === 'review' && file) {
    const review = read(path.resolve(cwd, file));
    validateReview(root, review, snapshot(root));
    write(path.join(evidenceDir(root), 'review.json'), review);
    console.log('Recorded review with evidence references. This records an attestation; it does not perform a review.');
  } else if (action === 'verify') {
    verifyEvidence(root);
    console.log('Quality checks and review evidence match the staged commit.');
  } else throw new Error('Usage: node scripts/commit-evidence.mjs snapshot|check|review <file>|verify');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Commit evidence gate: ${error.message}`); process.exitCode = 1; }
}
