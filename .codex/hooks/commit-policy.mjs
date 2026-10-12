#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyEvidence } from '../../scripts/commit-evidence.mjs';

// The Git pre-commit hook is the authoritative check. This early Codex guard
// gives actionable feedback for direct commits, wrappers, and nested shell calls.
const deny = (reason) => console.log(JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason,
} }));
try {
  const event = JSON.parse(fs.readFileSync(0, 'utf8'));
  const input = event.tool_input ?? {};
  let command = typeof input === 'string' ? input : input.command ?? input.cmd ?? input.code ?? '';
  let cwd = input.workdir ?? input.cwd ?? event.cwd;
  // Decode only a single static JSON call, without evaluating JavaScript.
  const wrapper = /^(?:text\(await tools\.exec_command\((\{[\s\S]*\})\)\);|await tools\.exec_command\((\{[\s\S]*\})\);)\s*$/.exec(command);
  if (wrapper) {
    const args = JSON.parse(wrapper[1] ?? wrapper[2]);
    const allowed = ['cmd', 'workdir', 'sandbox_permissions', 'justification', 'prefix_rule', 'yield_time_ms', 'max_output_tokens', 'tty'];
    if (Object.keys(args).some((key) => !allowed.includes(key))) throw new Error('Unsupported wrapped tool argument');
    if (typeof args.cmd !== 'string' || typeof args.workdir !== 'string' || !args.workdir.startsWith('/')) throw new Error('Wrapped calls require static command and absolute working directory');
    command = args.cmd;
    cwd = args.workdir;
  }
  // Some tool bridges forward only a Bash command and omit its workdir.
  // An explicit literal -C makes the effective Git directory verifiable.
  const explicitDirectory = /^git -C (?:"([^"\n]+)"|'([^'\n]+)') (commit(?:\s[\s\S]*)?)$/.exec(command);
  if (explicitDirectory) {
    cwd = explicitDirectory[1] ?? explicitDirectory[2];
    if (!cwd.startsWith('/') || /[$`\\]/.test(cwd)) throw new Error('Git directory must be a literal absolute path');
    command = `git ${explicitDirectory[3]}`;
  }
  const isCommit = /\bgit\b[\s\S]*\s(?:commit|commit-tree)(?=\s|$|["\x27);&|])/.test(command);
  if (isCommit) {
    // Do not bless a compound command that could mutate files after validation,
    // change the index, redirect Git to another repository, or bypass Git hooks.
    if (/[$`\\]/.test(command) || !/^git\s+commit(?:\s+(?:-m|--message)\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*$/.test(command)) {
      deny('Use a standalone git commit -m "..." after staging, checking and reviewing. Compound commands, alternate indexes/repos and hook bypass flags are not verified.');
    } else {
      const root = fileURLToPath(new URL('../../', import.meta.url));
      if (typeof cwd !== 'string') throw new Error('Missing tool working directory');
      const target = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
      if (fs.realpathSync(target) !== fs.realpathSync(root)) throw new Error('Commit targets a different repository');
      verifyEvidence(root);
      console.log('{}');
    }
  } else console.log('{}');
} catch (error) {
  deny(`Commit policy could not verify evidence: ${error.message}. Run pnpm quality:record and record a review for the staged tree. See docs/commit-quality.md.`);
}
