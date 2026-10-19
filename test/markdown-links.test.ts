import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const markdownFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : markdownFiles(relative);
      return entry.name.endsWith('.md') ? [relative] : [];
    }),
  );
  return nested.flat();
};

/** Relative link targets in a Markdown file, outside fenced code blocks, without any #fragment. */
const relativeTargets = (text: string): string[] => {
  const targets: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) continue;
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = match[1] ?? '';
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\/)/i.test(href)) continue;
      const target = href.split('#')[0] ?? '';
      if (target) targets.push(target);
    }
  }
  return targets;
};

describe('relative links in the README and docs', () => {
  it('should point at a file or folder that exists when a Markdown link is relative', async () => {
    const files = ['README.md', 'CONTRIBUTING.md', ...(await markdownFiles('docs')), ...(await markdownFiles('docs-site'))];
    const broken: string[] = [];

    for (const file of files) {
      const text = await readFile(path.join(root, file), 'utf8').catch(() => '');
      for (const target of relativeTargets(text)) {
        const resolved = path.join(root, path.dirname(file), decodeURIComponent(target));
        await access(resolved).catch(() => broken.push(`${file} -> ${target}`));
      }
    }

    expect(broken).toEqual([]);
  });
});
