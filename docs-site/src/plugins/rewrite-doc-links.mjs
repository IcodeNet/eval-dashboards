import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineMdastPlugin } from 'satteri';

const REPO_BLOB_URL = 'https://github.com/IcodeNet/eval-dashboards/blob/main';
const BASE = '/eval-dashboards';
const DOCS_ROOT = fileURLToPath(new URL('../../../docs/', import.meta.url));

const isExternal = (href) => /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href);

/** A path that already starts with the site base is a finished site link, not a repo file. */
const isSiteLink = (href) => href === BASE || href.startsWith(`${BASE}/`);

/** Route for a doc id, for example `teach-labs/README` -> `teach-labs`. */
export const routeForDocPath = (docPath) =>
  docPath
    .replace(/\.md$/i, '')
    .replace(/(^|\/)readme$/i, '')
    .replace(/\/$/, '')
    .toLowerCase();

/**
 * Rewrites one link from a Markdown file under `docs/`. A link to another doc becomes a
 * site route. A link to any other repo file becomes a GitHub URL, so no link is a dead end.
 * `sourceFile` is the path of the file that holds the link, relative to the repo root.
 */
export const rewriteLink = (href, sourceFile) => {
  if (isExternal(href) || isSiteLink(href)) return href;
  const [target, hash = ''] = href.split('#');
  if (!target) return href;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), target));
  const suffix = hash ? `#${hash}` : '';
  if (resolved.startsWith('docs/') && resolved.toLowerCase().endsWith('.md')) {
    const route = routeForDocPath(resolved.slice('docs/'.length));
    return `${BASE}/docs/${route ? `${route}/` : ''}${suffix}`;
  }
  return `${REPO_BLOB_URL}/${resolved}${suffix}`;
};

export const rewriteDocLinks = defineMdastPlugin({
  name: 'rewrite-doc-links',
  link(node, ctx) {
    const fileUrl = ctx.fileURL;
    if (!fileUrl) return;
    const absolute = fileURLToPath(fileUrl);
    if (!absolute.startsWith(DOCS_ROOT)) return;
    const sourceFile = path.posix.join('docs', path.relative(DOCS_ROOT, absolute).split(path.sep).join('/'));
    ctx.setProperty(node, 'url', rewriteLink(node.url, sourceFile));
  },
});
