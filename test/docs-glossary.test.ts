import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { GLOSSARY } from '../docs-site/src/data/glossary.mjs';

type Term = { term: string; definition: string; page: string };

const terms = GLOSSARY as Term[];
const fileFor = (page: string): string => path.resolve(process.cwd(), 'docs', page.endsWith('/') ? `${page}README.md` : `${page}.md`);

describe('glossary data', () => {
  it('should have no two entries with the same term when terms are compared ignoring case', () => {
    const names = terms.map((entry) => entry.term.toLowerCase());

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('should keep every definition to two sentences or fewer when a term is defined', () => {
    const tooLong = terms.filter((entry) => (entry.definition.match(/[.!?](\s|$)/g) ?? []).length > 2);

    expect(tooLong.map((entry) => entry.term)).toEqual([]);
  });

  it('should give every entry a non-empty term and definition', () => {
    expect(terms.filter((entry) => entry.term.trim() === '' || entry.definition.trim() === '')).toEqual([]);
  });

  it('should link every entry to a docs page that exists', async () => {
    const missing: string[] = [];
    for (const entry of terms) {
      await access(fileFor(entry.page)).catch(() => missing.push(`${entry.term} -> ${entry.page}`));
    }

    expect(missing).toEqual([]);
  });

  it('should include the terms the roadmap promised when the glossary is seeded', () => {
    const names = terms.map((entry) => entry.term);

    for (const required of ['Gate', 'Baseline', 'Taxonomy', 'Artifact', 'Waiver', 'Heartbeat', 'Evidence bundle', 'Champion baseline', 'Rolling baseline']) {
      expect(names).toContain(required);
    }
  });
});

describe('glossary links on built pages', () => {
  const read = (file: string): Promise<string> =>
    readFile(path.resolve(process.cwd(), 'docs-site/dist', file), 'utf8');
  const mainOf = (html: string): string => html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '';

  it('should render one entry per term on the glossary page when the site is built', async () => {
    const page = await read('docs/glossary/index.html');

    expect([...page.matchAll(/<dt id="/g)]).toHaveLength(terms.length);
    expect(page).toContain('<dt id="evidence-bundle">Evidence bundle</dt>');
  });

  it('should link the first use of gate and no later one when a page uses the word twice', async () => {
    const main = mainOf(await read('docs/gates/index.html'));

    expect([...main.matchAll(/href="\/eval-dashboards\/docs\/glossary\/#gate"/g)]).toHaveLength(1);
  });

  it('should keep the site base on a glossary link when the link is rewritten', async () => {
    const main = mainOf(await read('docs/faq/index.html'));

    expect(main).toContain('<a href="/eval-dashboards/docs/glossary/#gate">');
    expect(main).not.toContain('github.com/IcodeNet/eval-dashboards/blob/main/docs/eval-dashboards');
  });

  it('should not link a term inside a heading when the heading contains the word', async () => {
    const main = mainOf(await read('docs/gates/index.html'));

    expect(main).toMatch(/<h1[^>]*>Gates<\/h1>/);
  });

  it('should point only at glossary entries that exist when any docs page links a term', async () => {
    const glossary = await read('docs/glossary/index.html');
    const ids = new Set([...glossary.matchAll(/<dt id="([^"]+)"/g)].map((match) => match[1]));
    const gates = mainOf(await read('docs/gates/index.html'));
    const linked = [...gates.matchAll(/glossary\/#([a-z-]+)"/g)].map((match) => match[1]);

    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((id) => !ids.has(id))).toEqual([]);
  });
});
