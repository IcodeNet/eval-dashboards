import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { searchIndex, snippetFor, tokenize } from '../docs-site/public/search-core.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { htmlToText, markdownHeadings, markdownTitle, markdownToText } from '../docs-site/src/search/build-index.mjs';

type Entry = { title: string; url: string; headings: string[]; text: string };

const entry = (overrides: Partial<Entry>): Entry => ({
  title: 'Page',
  url: '/page/',
  headings: [],
  text: '',
  ...overrides,
});

describe('tokenize', () => {
  it('should lower-case and split on spaces when the query has several words', () => {
    expect(tokenize('  Baseline   STRATEGY ')).toEqual(['baseline', 'strategy']);
  });

  it('should return no terms when the query is blank', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('searchIndex', () => {
  const gates = entry({ title: 'Gates', url: '/gates/', headings: ['Baselines'], text: 'quality gates in CI' });
  const faq = entry({ title: 'FAQ', url: '/faq/', text: 'mentions gates once' });
  const other = entry({ title: 'Other', url: '/other/', text: 'nothing relevant' });

  it('should return nothing when the query is blank', () => {
    expect(searchIndex([gates, faq], '')).toEqual([]);
  });

  it('should rank a title match above a body match when both pages contain the term', () => {
    expect(searchIndex([faq, other, gates], 'gates').map((hit: Entry) => hit.url)).toEqual(['/gates/', '/faq/']);
  });

  it('should rank a page whose whole title is the query above a page that only has it inside a longer title', () => {
    const exercise = entry({ title: 'Exercise 08: Run gates for release decisions', url: '/exercise/', text: 'gates gates gates' });
    const page = entry({ title: 'Gates', url: '/gates/', text: 'gates gates gates' });

    expect(searchIndex([exercise, page], 'gates').map((hit: Entry) => hit.url)).toEqual(['/gates/', '/exercise/']);
  });

  it('should ignore case and surrounding spaces when matching a whole title', () => {
    const exercise = entry({ title: 'Run gates in CI', url: '/exercise/', text: 'gates' });
    const page = entry({ title: 'Gates', url: '/gates/', text: 'gates' });

    expect(searchIndex([exercise, page], '  GATES ').map((hit: Entry) => hit.url)).toEqual(['/gates/', '/exercise/']);
  });

  it('should require every term when the query has two words', () => {
    expect(searchIndex([gates, faq], 'gates quality').map((hit: Entry) => hit.url)).toEqual(['/gates/']);
  });

  it('should match a heading when the term is not in the title or body', () => {
    expect(searchIndex([gates, other], 'baselines').map((hit: Entry) => hit.url)).toEqual(['/gates/']);
  });

  it('should ignore case when the query is upper case', () => {
    expect(searchIndex([gates], 'GATES').map((hit: Entry) => hit.url)).toEqual(['/gates/']);
  });

  it('should return nothing when no page contains the term', () => {
    expect(searchIndex([gates, faq, other], 'zzzzzz')).toEqual([]);
  });
});

describe('snippetFor', () => {
  it('should centre the snippet on the first match and mark the cut when the text is long', () => {
    const text = `${'a '.repeat(80)}needle ${'b '.repeat(80)}`;

    const snippet = snippetFor(entry({ text }), 'needle');

    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
  });

  it('should start at the beginning when the match is near the start', () => {
    expect(snippetFor(entry({ text: 'needle at the start' }), 'needle')).toBe('needle at the start');
  });
});

describe('markdown to search text', () => {
  it('should keep link text and drop the address when a link is converted', () => {
    expect(markdownToText('See [the gates guide](./gates.md) now')).toBe('See the gates guide now');
  });

  it('should keep inline code text when a flag name is in backticks', () => {
    expect(markdownToText('Use `--min-pass-rate` to set it')).toBe('Use --min-pass-rate to set it');
  });

  it('should drop the code fence lines but keep the code when a block is converted', () => {
    expect(markdownToText('```sh\neval-dashboards check\n```')).toBe('eval-dashboards check');
  });

  it('should find headings outside code blocks only when a shell comment starts with a hash', () => {
    expect(markdownHeadings('# Title\n\n```sh\n# a comment\n```\n\n## Real heading\n')).toEqual(['Title', 'Real heading']);
  });

  it('should use the first heading as the title when one exists', () => {
    expect(markdownTitle('# My Page\n\ntext', 'fallback')).toBe('My Page');
  });

  it('should use the fallback title when there is no heading', () => {
    expect(markdownTitle('just text', 'fallback')).toBe('fallback');
  });
});

describe('html to search text', () => {
  it('should drop scripts and tags and decode entities when a page is converted', () => {
    expect(htmlToText('<h1>A &amp; B</h1><script>var x=1;</script><p>text</p>')).toBe('A & B text');
  });
});

describe('built search index', () => {
  const load = async (): Promise<Entry[]> =>
    JSON.parse(await readFile(path.resolve(process.cwd(), 'docs-site/dist/search-index.json'), 'utf8')) as Entry[];

  it('should cover all published docs, the glossary and 11 legacy pages when the site is built', async () => {
    const entries = await load();

    expect(entries.filter((item) => item.url.startsWith('/eval-dashboards/docs/'))).toHaveLength(89);
    expect(entries.filter((item) => item.url.startsWith('/eval-dashboards/v1/'))).toHaveLength(11);
  });

  it('should find the gates guide first when the query is a flag only that guide explains', async () => {
    const hits = searchIndex(await load(), '--baseline-gate-config') as Entry[];

    expect(hits[0]?.url).toBe('/eval-dashboards/docs/gates/');
  });

  it('should find a page that the old hand-typed search could not reach when the term is in the body of a doc', async () => {
    const hits = searchIndex(await load(), 'heartbeat-verify') as Entry[];

    expect(hits.map((hit) => hit.url)).toContain('/eval-dashboards/docs/gates/');
  });

  it('should find the glossary page first when the query is a glossary-only phrase', async () => {
    const hits = searchIndex(await load(), 'case may simply have been removed') as Entry[];

    expect(hits[0]?.url).toBe('/eval-dashboards/docs/glossary/');
  });

  it('should find a legacy page when the term is in its content', async () => {
    const hits = searchIndex(await load(), 'assistant-ui') as Entry[];

    expect(hits.map((hit) => hit.url)).toContain('/eval-dashboards/v1/assistant-ui-case-study.html');
  });
});

describe('search dialog on a built page', () => {
  it('should include the search button, dialog and index address when a docs page is built', async () => {
    const page = await readFile(path.resolve(process.cwd(), 'docs-site/dist/docs/gates/index.html'), 'utf8');

    expect(page).toContain('class="search-open"');
    expect(page).toContain('<dialog id="docs-search"');
    expect(page).toContain('/eval-dashboards/search-index.json');
    expect(page).toContain('/eval-dashboards/search-core.mjs');
  });
});
