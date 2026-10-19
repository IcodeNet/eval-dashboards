import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Checks a built docs site: every internal link and asset reference must resolve to a file in
 * the output. Returns one message per problem, so an empty array means the site is consistent.
 */
export const BASE = '/eval-dashboards';

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])),
  );
  return nested.flat();
};

const exists = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

/** File in `outDir` that a site URL path resolves to, or undefined. */
export const resolveSitePath = async (outDir, urlPath) => {
  if (!urlPath.startsWith(`${BASE}/`) && urlPath !== BASE) return undefined;
  const relative = decodeURIComponent(urlPath.slice(BASE.length)).replace(/^\//, '');
  const direct = path.join(outDir, relative);
  if (relative === '' || relative.endsWith('/')) {
    const index = path.join(direct, 'index.html');
    return (await exists(index)) ? index : undefined;
  }
  if (await exists(direct)) return direct;
  const asDirectory = path.join(direct, 'index.html');
  return (await exists(asDirectory)) ? asDirectory : undefined;
};

const idCache = new Map();

/** Every `id` and anchor `name` on a built page, so a link's #fragment can be checked. */
const idsOf = async (file) => {
  if (!idCache.has(file)) {
    const html = (await readFile(file, 'utf8')).replace(/<script\b[\s\S]*?<\/script>/gi, '');
    idCache.set(file, new Set([...html.matchAll(/\b(?:id|name)="([^"]+)"/g)].map((match) => match[1])));
  }
  return idCache.get(file);
};

export const checkBuiltSite = async (outDir) => {
  idCache.clear();
  const problems = [];
  const pages = (await walk(outDir)).filter((file) => file.endsWith('.html'));
  for (const page of pages) {
    const html = (await readFile(page, 'utf8')).replace(/<script\b[\s\S]*?<\/script>/gi, '');
    const pageUrl = `${BASE}/${path.relative(outDir, page).split(path.sep).join('/')}`;
    const pageDirectory = pageUrl.slice(0, pageUrl.lastIndexOf('/') + 1);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = match[1].replaceAll('&amp;', '&');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      const [pathPart, fragment = ''] = raw.split('#');
      const withoutQuery = pathPart.split('?')[0];
      if (!withoutQuery && !fragment) continue;
      const absolute = !withoutQuery
        ? pageUrl
        : withoutQuery.startsWith('/')
          ? withoutQuery
          : path.posix.normalize(path.posix.join(pageDirectory, withoutQuery));
      const target = withoutQuery ? await resolveSitePath(outDir, absolute) : page;
      if (!target) {
        problems.push(`${pageUrl}: broken reference ${raw}`);
        continue;
      }
      if (fragment && target.endsWith('.html') && !(await idsOf(target)).has(decodeURIComponent(fragment))) {
        problems.push(`${pageUrl}: missing anchor #${fragment} in ${raw.split('#')[0] || 'this page'}`);
      }
    }
  }
  problems.push(...(await orphanDocsPages(outDir, pages)));
  return problems;
};

/** Pages under `/docs/` that no sidebar link reaches. Skipped when the site has no sidebar. */
const orphanDocsPages = async (outDir, pages) => {
  const home = path.join(outDir, 'docs', 'index.html');
  if (!(await exists(home))) return [];
  const sidebar = (await readFile(home, 'utf8')).match(/<nav class="sidebar"[\s\S]*?<\/nav>/)?.[0];
  if (!sidebar) return [];
  const linked = new Set([...sidebar.matchAll(/href="([^"#]+)/g)].map((match) => match[1]));
  return pages
    .map((page) => `${BASE}/${path.relative(outDir, page).split(path.sep).join('/')}`.replace(/index\.html$/, ''))
    .filter((url) => url.startsWith(`${BASE}/docs/`) && !linked.has(url))
    .map((url) => `${url}: orphan page, no sidebar link reaches it`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = path.resolve(process.argv[2] ?? 'dist');
  const problems = await checkBuiltSite(outDir);
  if (problems.length > 0) {
    console.error(`Docs site check failed: ${problems.length} problem(s)`);
    for (const problem of problems.slice(0, 50)) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Docs site check passed.');
  }
}
