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

export const checkBuiltSite = async (outDir) => {
  const problems = [];
  const pages = (await walk(outDir)).filter((file) => file.endsWith('.html'));
  for (const page of pages) {
    const html = (await readFile(page, 'utf8')).replace(/<script\b[\s\S]*?<\/script>/gi, '');
    const pageUrl = `${BASE}/${path.relative(outDir, page).split(path.sep).join('/')}`;
    const pageDirectory = pageUrl.slice(0, pageUrl.lastIndexOf('/') + 1);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = match[1].replaceAll('&amp;', '&');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
      const withoutHash = raw.split('#')[0].split('?')[0];
      if (!withoutHash) continue;
      const absolute = withoutHash.startsWith('/')
        ? withoutHash
        : path.posix.normalize(path.posix.join(pageDirectory, withoutHash));
      if (!(await resolveSitePath(outDir, absolute))) {
        problems.push(`${pageUrl}: broken reference ${raw}`);
      }
    }
  }
  return problems;
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
