import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { INDEX_ENTRY, SIDEBAR } from '../docs-site/src/data/sidebar.mjs';

type Group = { label: string; items: string[] };

const docsRoot = path.resolve(process.cwd(), 'docs');

const markdownFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(path.join(docsRoot, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return markdownFiles(relative);
      return entry.name.endsWith('.md') ? [relative] : [];
    }),
  );
  return nested.flat();
};

/** `integrations/` -> `integrations/README.md`; `gates` -> `gates.md`. */
const fileForEntry = (entry: string): string => (entry.endsWith('/') ? `${entry}README.md` : `${entry}.md`);

const entries = (SIDEBAR as Group[]).flatMap((group) => group.items);

describe('docs sidebar', () => {
  it('should list every Markdown file in docs when a page is published', async () => {
    const listed = new Set([...entries.map(fileForEntry), fileForEntry(INDEX_ENTRY)]);
    const onDisk = await markdownFiles('');

    expect(onDisk.filter((file) => !listed.has(file)).sort()).toEqual([]);
  });

  it('should point only at files that exist when an entry is listed', async () => {
    const onDisk = new Set(await markdownFiles(''));

    expect(entries.map(fileForEntry).filter((file) => !onDisk.has(file))).toEqual([]);
  });

  it('should list each page once when it is placed in a group', () => {
    const files = entries.map(fileForEntry);
    const repeated = files.filter((file, index) => files.indexOf(file) !== index);

    expect(repeated).toEqual([]);
  });

  it('should give every group a label and at least one page', () => {
    for (const group of SIDEBAR as Group[]) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
