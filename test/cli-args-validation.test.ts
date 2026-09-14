import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertKnownFlags,
  knownFlagsByCommand,
  parseArgs,
  UnknownFlagError,
} from '../src/cli/args.js';

const helpDir = path.resolve(process.cwd(), 'docs/cli-help');

const flagsInHelpSnapshot = async (command: string): Promise<string[]> => {
  const text = await readFile(path.join(helpDir, `${command}.txt`), 'utf8');
  const matches = text.matchAll(/^\s+(--[a-z][a-z-]*)/gm);
  return [...new Set([...matches].map((match) => match[1] as string))].sort();
};

describe('assertKnownFlags', () => {
  it('accepts flags the command supports', () => {
    const args = parseArgs(['check', '--input=.evals_output', '--min-pass-rate=0.9']);
    expect(() => assertKnownFlags(args)).not.toThrow();
  });

  it('accepts --help for any known command', () => {
    expect(() => assertKnownFlags(parseArgs(['history', '--help']))).not.toThrow();
  });

  it('rejects a flag that belongs to a different command', () => {
    // --history-dir was documented in a teaching exercise but never existed.
    // It used to be silently ignored, so history wrote to the default path
    // while appearing to honour the flag.
    const args = parseArgs(['history', '--input=.evals_output', '--history-dir=eval-report']);
    expect(() => assertKnownFlags(args)).toThrow(UnknownFlagError);
  });

  it('rejects a misspelled gate flag rather than silently dropping the gate', () => {
    const args = parseArgs(['check', '--min-pass-rat=0.9']);
    expect(() => assertKnownFlags(args)).toThrow(/Unknown option --min-pass-rat/);
  });

  it('suggests the closest flag for a typo', () => {
    try {
      assertKnownFlags(parseArgs(['check', '--min-pass-rat=0.9']));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownFlagError);
      expect((error as UnknownFlagError).suggestion).toBe('--min-pass-rate');
      expect((error as UnknownFlagError).message).toContain('Did you mean --min-pass-rate?');
    }
  });

  it('points the user at the command help', () => {
    try {
      assertKnownFlags(parseArgs(['report', '--nonsense']));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('eval-dashboards report --help');
    }
  });

  it('ignores commands with no registered flag list', () => {
    expect(() => assertKnownFlags(parseArgs(['brand-new-command', '--anything']))).not.toThrow();
  });

  it('does nothing when no command is given', () => {
    expect(() => assertKnownFlags(parseArgs([]))).not.toThrow();
  });
});

describe('flag registry matches the CLI help snapshots', () => {
  const commands = Object.keys(knownFlagsByCommand).filter(
    // teach shares init's scaffolding flags; its snapshot is checked via init.
    (command) => command !== 'teach',
  );

  it.each(commands)('%s registry covers every documented flag', async (command) => {
    const documented = await flagsInHelpSnapshot(command);
    const registered = new Set([...(knownFlagsByCommand[command] ?? []), '--help']);
    const missing = documented.filter((flag) => !registered.has(flag));

    expect(missing, `${command} registry is missing documented flags`).toEqual([]);
  });
});
