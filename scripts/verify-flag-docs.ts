/**
 * Flag documentation coverage check (`pnpm docs:flags`).
 *
 * Help snapshots in `docs/cli-help/` are regenerated from `--help`, so a new
 * flag always passes the snapshot check even when no guide explains it. This
 * check requires every flag in `knownFlagsByCommand` (src/cli/args.ts) to be
 * explained in a user guide, next to its command.
 *
 * Rules:
 * - Only guides count: README.md, docs/** and docs-site/**, minus generated
 *   help snapshots and planning/status files (ROADMAP, STATUS, CHANGELOG,
 *   proposition/review docs), which record history rather than explain use.
 * - The flag must appear as a whole token (`--out` is not satisfied by
 *   `--out-dir`) in the same heading section as its command: a section that
 *   also contains `eval-dashboards <command>` or `<command>` in backticks. So
 *   a flag shared by several commands must be documented for each one.
 * - A few flags are generic across commands (see GENERIC_FLAGS) and only need
 *   one mention anywhere in the guides.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type FlagDocIssue = { command: string; flag: string };

// Flags whose meaning is the same for every command that takes them.
export const GENERIC_FLAGS = new Set(['--help', '--input', '--out']);

// Relative paths (POSIX) that record plans or history, not usage.
export const NON_GUIDE_FILES = new Set([
  'docs/ROADMAP.md',
  'docs/STATUS.md',
  'docs/PRP.md',
  'docs/PROPOSITION-AND-TAXONOMY.md',
  'docs/PROPOSITION-REVIEW.md',
  'docs/community-partnership-log.md',
  'docs/adoption-friction-backlog.md',
  'CHANGELOG.md',
]);

export const NON_GUIDE_DIRS = ['docs/cli-help/', 'docs/reviews/', 'docs/adoption-metrics/'];

export const isGuideFile = (relativePath: string): boolean => {
  const posix = relativePath.split(path.sep).join('/');
  if (NON_GUIDE_FILES.has(posix)) return false;
  return !NON_GUIDE_DIRS.some((dir) => posix.startsWith(dir));
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-token match: `--out` must not be satisfied by `--out-dir`.
export const mentionsFlag = (text: string, flag: string): boolean =>
  new RegExp(`${escapeRegExp(flag)}(?![A-Za-z0-9-])`).test(text);

export const mentionsCommand = (text: string, command: string): boolean => {
  const name = escapeRegExp(command);
  return new RegExp(`eval-dashboards ${name}(?![A-Za-z0-9-])|\`${name}\``).test(text);
};

const stripHtml = (text: string): string =>
  text
    .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<\/(p|li|pre|section|h[1-6]|tr|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * Split a guide into sections at markdown headings (`#`..`######`) or HTML
 * `<h1>`..`<h6>` (converted to markdown headings first). Fenced code blocks
 * are kept whole, so a `#` comment inside a code block is not a heading.
 */
export const splitBlocks = (text: string): string[] => {
  const sections: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (!inFence && /^#{1,6}\s/.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  sections.push(current.join('\n'));
  return sections.filter((section) => section.trim() !== '');
};

export const findUndocumentedFlags = (
  flagsByCommand: Record<string, readonly string[]>,
  guides: readonly string[],
): { checked: number; missing: FlagDocIssue[] } => {
  const blocks = guides.flatMap(splitBlocks);
  const corpus = guides.join('\n');
  const missing: FlagDocIssue[] = [];
  let checked = 0;

  for (const [command, flags] of Object.entries(flagsByCommand)) {
    for (const flag of flags) {
      if (flag === '--help') continue;
      checked += 1;
      const documented = GENERIC_FLAGS.has(flag)
        ? mentionsFlag(corpus, flag)
        : blocks.some((block) => mentionsFlag(block, flag) && mentionsCommand(block, command));
      if (!documented) missing.push({ command, flag });
    }
  }

  return { checked, missing };
};

const collectFiles = async (root: string, dir: string, extensions: readonly string[]): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relative, extensions)));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(relative);
    }
  }
  return files;
};

export const loadGuides = async (repoRoot: string): Promise<string[]> => {
  const files = [
    'README.md',
    ...(await collectFiles(repoRoot, 'docs', ['.md'])),
    ...(await collectFiles(repoRoot, 'docs-site', ['.html', '.md'])),
  ].filter(isGuideFile);

  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(path.join(repoRoot, file), 'utf8');
      return file.endsWith('.html') ? stripHtml(text) : text;
    }),
  );
};

const main = async (): Promise<void> => {
  const { knownFlagsByCommand } = await import('../src/cli/args.js');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { checked, missing } = findUndocumentedFlags(knownFlagsByCommand, await loadGuides(repoRoot));

  if (missing.length > 0) {
    console.error(`Flag docs check failed: ${missing.length} of ${checked} flag(s) are not explained in a guide.`);
    console.error(
      'Mention each flag in the same heading section as `eval-dashboards <command>` (or `<command>` in backticks)',
    );
    console.error('in README.md, docs/ or docs-site/ (not docs/cli-help/, ROADMAP, STATUS or CHANGELOG):');
    for (const { command, flag } of missing) console.error(`  - ${command} ${flag}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Flag docs check passed: all ${checked} flag(s) are explained in the same guide section as their command.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
