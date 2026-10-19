import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UnknownFlagError, assertKnownFlags, knownFlagsByCommand, parseArgs } from '../src/cli/args.js';
import { isGuideFile } from '../scripts/verify-flag-docs.js';

const root = process.cwd();

const collectMarkdown = async (dir: string): Promise<string[]> => {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectMarkdown(relative);
      return entry.name.endsWith('.md') ? [relative] : [];
    }),
  );
  return nested.flat();
};

/** Lines inside fenced code blocks that start with `eval-dashboards <command>`, with `\` continuations joined. */
const commandLinesIn = (text: string): string[] => {
  const lines: string[] = [];
  let inFence = false;
  let pending = '';
  for (const raw of text.split('\n')) {
    if (raw.trimStart().startsWith('```')) {
      inFence = !inFence;
      pending = '';
      continue;
    }
    if (!inFence) continue;
    const line = pending ? `${pending} ${raw.trim()}` : raw.trim().replace(/^\$\s*/, '');
    if (line.endsWith('\\')) {
      pending = line.slice(0, -1).trim();
      continue;
    }
    pending = '';
    if (/^(?:pnpm (?:dlx )?|npx )?eval-dashboards [a-z]/.test(line)) lines.push(line);
  }
  return lines;
};

const toArgv = (line: string): string[] =>
  line
    .replace(/^(?:pnpm (?:dlx )?|npx )?eval-dashboards /, '')
    .split(/\s+(?:\||&&|>|2>)\s*/)[0]!
    .split(/\s+/)
    .filter((token) => token.length > 0);

describe('commands shown in the guides', () => {
  it('should parse against the flag registry when a guide shows a command line', async () => {
    const files = [...(await collectMarkdown('docs')), 'README.md'].filter(isGuideFile);
    const problems: string[] = [];
    let checked = 0;

    for (const file of files) {
      const text = await readFile(path.join(root, file), 'utf8');
      for (const line of commandLinesIn(text)) {
        const argv = toArgv(line);
        const command = argv[0];
        if (!command || !Object.hasOwn(knownFlagsByCommand, command)) continue;
        checked += 1;
        try {
          assertKnownFlags(parseArgs(argv));
        } catch (error) {
          if (!(error instanceof UnknownFlagError)) throw error;
          problems.push(`${file}: ${line} -> ${error.message.split('\n')[0]}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(50);
    expect(problems).toEqual([]);
  });
});
