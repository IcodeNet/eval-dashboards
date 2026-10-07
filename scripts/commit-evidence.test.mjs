import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requiredChecks, snapshot, validateReview, verifyEvidence, recordChecks } from './commit-evidence.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-evidence-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, '.codex/hooks'), { recursive: true });
  fs.copyFileSync(fileURLToPath(new URL('./commit-evidence.mjs', import.meta.url)), path.join(root, 'scripts/commit-evidence.mjs'));
  fs.copyFileSync(fileURLToPath(new URL('../.codex/hooks/commit-policy.mjs', import.meta.url)), path.join(root, '.codex/hooks/commit-policy.mjs'));
  fs.writeFileSync(path.join(root, 'code.txt'), 'verified content\n');
  git('add', '.');
  const current = snapshot(root);
  const dir = path.join(root, '.git/quality-evidence');
  fs.mkdirSync(dir);
  const review = { ...current, reviewer: 'test reviewer', verdict: 'pass', findings: [], claims: [
    { claim: 'The staged content was inspected.', evidence: [{ path: 'code.txt', line: 1 }] },
  ] };
  const results = requiredChecks.map((command) => {
    const log = `${command.replaceAll(':', '-')}.log`;
    fs.writeFileSync(path.join(dir, log), 'fixture test output\n');
    return { command, exitCode: 0, log, sha256: createHash('sha256').update('fixture test output\n').digest('hex') };
  });
  fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify({ ...current, results }));
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(review));
  const hook = (command) => {
    const result = spawnSync(process.execPath, [path.join(root, '.codex/hooks/commit-policy.mjs')], {
      input: JSON.stringify({ cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { root, git, dir, review, current, results, hook };
}

test('allows exact staged tree with successful logs and cited review', (t) => {
  const f = fixture(t);
  assert.deepEqual(verifyEvidence(f.root), f.current);
  assert.deepEqual(f.hook('git commit -m "test: verified change"'), {});
});
test('rejects missing, failed or modified check evidence', (t) => {
  const f = fixture(t);
  f.results[0].exitCode = 1;
  fs.writeFileSync(path.join(f.dir, 'checks.json'), JSON.stringify({ ...f.current, results: f.results }));
  assert.throws(() => verifyEvidence(f.root), /Missing successful/);
  f.results[0].exitCode = 0;
  fs.writeFileSync(path.join(f.dir, 'checks.json'), JSON.stringify({ ...f.current, results: f.results }));
  fs.appendFileSync(path.join(f.dir, f.results[0].log), 'changed');
  assert.throws(() => verifyEvidence(f.root), /log changed/);
  fs.unlinkSync(path.join(f.dir, 'checks.json'));
  assert.equal(f.hook('git commit -m "test: fail"').hookSpecificOutput.permissionDecision, 'deny');
});
test('rejects unstaged, untracked and newly staged changes after verification', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'code.txt'), 'changed\n');
  assert.throws(() => verifyEvidence(f.root), /Unstaged/);
  f.git('add', 'code.txt');
  assert.throws(() => verifyEvidence(f.root), /stale/);
  fs.writeFileSync(path.join(f.root, 'new.txt'), 'untracked');
  assert.throws(() => snapshot(f.root), /Untracked/);
});
test('rejects stale reviews, unresolved findings, absent claims and invalid citations', (t) => {
  const f = fixture(t);
  for (const change of [
    { tree: 'stale' }, { verdict: 'fail' }, { reviewer: '' },
    { findings: [{ status: 'open' }] }, { claims: [] },
    { claims: [{ claim: 'unsupported', evidence: [{ path: '../outside', line: 1 }] }] },
    { claims: [{ claim: 'unsupported', evidence: [{ path: 'code.txt', line: 99 }] }] },
  ]) assert.throws(() => validateReview(f.root, { ...f.review, ...change }, f.current));
});
test('Codex hook permits ordinary commands and denies compound/bypass commits', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.hook('pnpm test'), {});
  assert.deepEqual(f.hook('git diff -- scripts/commit-evidence.mjs'), {});
  for (const command of [
    'git commit --no-verify -m "bypass"', 'git -c core.hooksPath=/dev/null commit',
    'git add . && git commit -m "change"', 'git -C /other commit', 'git commit-tree abc',
    'git commit -am "unstaged"', 'git commit -m "$(touch /tmp/unexpected)"',
  ]) assert.equal(f.hook(command).hookSpecificOutput?.permissionDecision, 'deny', command);
});

test('real Git pre-commit rejects missing review and permits matching evidence', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, '.git/hooks/pre-commit'), '#!/bin/sh\nexec node scripts/commit-evidence.mjs verify\n', { mode: 0o755 });
  fs.unlinkSync(path.join(f.dir, 'review.json'));
  const commit = () => spawnSync('git', ['-c', 'user.name=Hook Test', '-c', 'user.email=hook@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'test: exercise commit gate'], { cwd: f.root, encoding: 'utf8' });
  assert.notEqual(commit().status, 0);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: f.root }).status, 128);
  fs.writeFileSync(path.join(f.dir, 'review.json'), JSON.stringify(f.review));
  const result = commit();
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => verifyEvidence(f.root), /stale/);
});

test('a failed rerun invalidates earlier success and stops subsequent checks', (t) => {
  const f = fixture(t);
  const bin = path.join(f.root, '.git', 'test-bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\necho "deliberate check failure"\nexit 7\n', { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
    assert.throws(() => recordChecks(f.root), /check failed/);
    const record = JSON.parse(fs.readFileSync(path.join(f.dir, 'checks.json'), 'utf8'));
    assert.equal(record.results.length, 1);
    assert.equal(record.results[0].exitCode, 7);
    assert.throws(() => verifyEvidence(f.root), /Missing successful check/);
  } finally {
    process.env.PATH = previousPath;
  }
});
