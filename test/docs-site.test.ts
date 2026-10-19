import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs modules without type declarations
import { checkBuiltSite } from '../docs-site/scripts/check-site.mjs';
// @ts-expect-error plain .mjs modules without type declarations
import { rewriteLink, routeForDocPath } from '../docs-site/src/plugins/rewrite-doc-links.mjs';

const siteRoot = path.resolve(process.cwd(), 'docs-site');
const distDir = path.join(siteRoot, 'dist');

/** Every page the old hand-written site served, which must keep its address. */
const LEGACY_URLS = [
  'index.html',
  'styles.css',
  'v1/index.html',
  'v1/adopt-now.html',
  'v1/api-reference.html',
  'v1/assistant-ui-case-study.html',
  'v1/ci-gates.html',
  'v1/cli.html',
  'v1/getting-started.html',
  'v1/integrations.html',
  'v1/publishing.html',
  'v1/schema-taxonomy.html',
  'v1/search.html',
  'v1/teach-labs.html',
];

describe('routeForDocPath', () => {
  it('should map a README to its folder route when the file is a directory index', () => {
    expect(routeForDocPath('teach-labs/README.md')).toBe('teach-labs');
  });

  it('should map the top README to the docs root when the file is docs/README.md', () => {
    expect(routeForDocPath('README.md')).toBe('');
  });

  it('should lower-case the route when the file name has capitals', () => {
    expect(routeForDocPath('ROADMAP.md')).toBe('roadmap');
  });
});

describe('rewriteLink', () => {
  it('should point at the site route when a doc links to a sibling doc', () => {
    expect(rewriteLink('./gates.md', 'docs/README.md')).toBe('/eval-dashboards/docs/gates/');
  });

  it('should keep the heading anchor when a doc links to a section of another doc', () => {
    expect(rewriteLink('./gates.md#baselines', 'docs/README.md')).toBe('/eval-dashboards/docs/gates/#baselines');
  });

  it('should resolve from the source folder when the link goes up a level', () => {
    expect(rewriteLink('../gates.md', 'docs/teach-labs/README.md')).toBe('/eval-dashboards/docs/gates/');
  });

  it('should point at GitHub when a doc links to a file outside docs', () => {
    expect(rewriteLink('../AGENTS.md', 'docs/REPO-HARDENING.md')).toBe(
      'https://github.com/IcodeNet/eval-dashboards/blob/main/AGENTS.md',
    );
  });

  it('should leave the link alone when it is an absolute URL', () => {
    expect(rewriteLink('https://example.com/x', 'docs/README.md')).toBe('https://example.com/x');
  });

  it('should leave the link alone when it is a same-page anchor', () => {
    expect(rewriteLink('#section', 'docs/README.md')).toBe('#section');
  });
});

describe('built docs site', () => {
  it.each(LEGACY_URLS)('should still serve %s when the site is rebuilt', async (url) => {
    await expect(access(path.join(distDir, url))).resolves.toBeUndefined();
  });

  it('should link the legacy home page to the full docs when a reader lands on v1', async () => {
    const built = await readFile(path.join(distDir, 'v1/index.html'), 'utf8');

    expect(built).toContain('<a href="../docs/">Open the full docs</a>');
  });

  it('should redirect the site root to the full docs when a reader opens the bare address', async () => {
    const built = await readFile(path.join(distDir, 'index.html'), 'utf8');

    expect(built).toContain('content="0; url=./docs/"');
  });

  it('should serve the legacy cli page byte for byte when it moves into the Astro project', async () => {
    const built = await readFile(path.join(distDir, 'v1/cli.html'), 'utf8');
    const source = await readFile(path.join(siteRoot, 'public/v1/cli.html'), 'utf8');
    expect(built).toBe(source);
  });

  it('should publish a page for every Markdown file in docs when the site is built', async () => {
    await expect(access(path.join(distDir, 'docs/gates/index.html'))).resolves.toBeUndefined();
    await expect(access(path.join(distDir, 'docs/teach-labs/index.html'))).resolves.toBeUndefined();
    await expect(access(path.join(distDir, 'docs/index.html'))).resolves.toBeUndefined();
  });

  it('should find no broken internal link or asset when the whole site is checked', async () => {
    expect(await checkBuiltSite(distDir)).toEqual([]);
  });

  it('should link every published docs page from the sidebar when the site is built', async () => {
    const home = await readFile(path.join(distDir, 'docs/index.html'), 'utf8');
    const sidebar = home.match(/<nav class="sidebar"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const linked = new Set([...sidebar.matchAll(/href="([^"]+)"/g)].map((match) => match[1]));
    const pages = (await readdir(path.join(distDir, 'docs'), { recursive: true }))
      .filter((file) => file.endsWith('index.html'))
      .map((file) => `/eval-dashboards/docs/${file.replace(/index\.html$/, '')}`);

    expect(pages.length).toBe(87);
    expect(pages.filter((page) => !linked.has(page))).toEqual([]);
  });

  it('should mark the current page and open its group when a nested page is built', async () => {
    const page = await readFile(path.join(distDir, 'docs/teach-labs/03-pr-review-triage/index.html'), 'utf8');

    expect(page).toContain('aria-current="page"');
    expect(page).toMatch(/<details class="sidebar-group" open[^>]*><summary>Teaching: labs<\/summary>/);
  });

  describe('link checker', () => {
    let scratch: string;

    beforeAll(async () => {
      scratch = await mkdtemp(path.join(tmpdir(), 'site-check-'));
      await writeFile(path.join(scratch, 'index.html'), '<a href="/eval-dashboards/missing/">x</a>', 'utf8');
    });

    afterAll(async () => {
      await rm(scratch, { recursive: true, force: true });
    });

    it('should report a missing anchor when a link names a heading that is not on the page', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'site-anchor-'));
      await mkdir(path.join(dir, 'docs'), { recursive: true });
      await writeFile(path.join(dir, 'docs/index.html'), '<h2 id="real">x</h2>', 'utf8');
      await writeFile(
        path.join(dir, 'index.html'),
        '<a href="/eval-dashboards/docs/#real">ok</a><a href="/eval-dashboards/docs/#gone">bad</a><a href="#top">self</a>',
        'utf8',
      );

      expect(await checkBuiltSite(dir)).toEqual([
        '/eval-dashboards/index.html: missing anchor #gone in /eval-dashboards/docs/',
        '/eval-dashboards/index.html: missing anchor #top in this page',
      ]);
      await rm(dir, { recursive: true, force: true });
    });

    it('should report the page and the target when a link points at nothing', async () => {
      expect(await checkBuiltSite(scratch)).toEqual([
        '/eval-dashboards/index.html: broken reference /eval-dashboards/missing/',
      ]);
    });
  });
});
