import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { knownFlagsByCommand } from '../src/cli/args.js';
import {
  findUndocumentedFlags,
  isGuideFile,
  mentionsFlag,
  splitBlocks,
} from '../scripts/verify-flag-docs.js';

const execFileAsync = promisify(execFile);

describe('flag docs coverage check (scripts/verify-flag-docs.ts)', () => {
  it('matches flags as whole tokens only', () => {
    expect(mentionsFlag('use --out-dir=x', '--out')).toBe(false);
    expect(mentionsFlag('use --out=x', '--out')).toBe(true);
    expect(mentionsFlag('`--force`', '--force')).toBe(true);
  });

  it('ignores generated help, planning and status files', () => {
    expect(isGuideFile('docs/cli-help/import.txt')).toBe(false);
    expect(isGuideFile('docs/ROADMAP.md')).toBe(false);
    expect(isGuideFile('docs/STATUS.md')).toBe(false);
    expect(isGuideFile('CHANGELOG.md')).toBe(false);
    expect(isGuideFile('docs/gates.md')).toBe(true);
    expect(isGuideFile('docs-site/v1/cli.html')).toBe(true);
  });

  it('keeps fenced code blocks whole so a # comment is not a heading', () => {
    const sections = splitBlocks('## A\n```sh\n# comment\nx\n```\n## B\ny');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('# comment');
  });

  it('requires a shared flag to be documented in a section for each command', () => {
    const flags = { report: ['--run-id'], check: ['--run-id'] };
    const guide = '## Report\n`eval-dashboards report --run-id=x`\n\n## Check\nRun `eval-dashboards check` in CI.';
    expect(findUndocumentedFlags(flags, [guide]).missing).toEqual([{ command: 'check', flag: '--run-id' }]);
  });

  it('does not count a flag mentioned only in a section about another command', () => {
    const flags = { teach: ['--playbook'] };
    const guide = '## Init\n`eval-dashboards init --playbook`';
    expect(findUndocumentedFlags(flags, [guide]).missing).toEqual([{ command: 'teach', flag: '--playbook' }]);
  });

  it('accepts generic flags mentioned anywhere', () => {
    const flags = { merge: ['--input', '--out'] };
    expect(findUndocumentedFlags(flags, ['Pass `--input=dir` and `--out=file`.']).missing).toEqual([]);
  });

  it('passes on the current repo: every registered flag is documented in a guide', async () => {
    const { stdout } = await execFileAsync('npx', ['tsx', 'scripts/verify-flag-docs.ts'], { cwd: process.cwd() });
    const checked = Object.values(knownFlagsByCommand)
      .flat()
      .filter((flag) => flag !== '--help').length;
    expect(stdout).toContain(`all ${checked} flag(s) are explained`);
  });
});
