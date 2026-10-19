import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { BASE } from '../site';
import { routeForDocPath } from '../plugins/rewrite-doc-links.mjs';
import { GLOSSARY } from '../data/glossary.mjs';
import {
  htmlHeadings,
  htmlTitle,
  htmlToText,
  markdownHeadings,
  markdownTitle,
  markdownToText,
} from '../search/build-index.mjs';

export const GET: APIRoute = async () => {
  const entries: Array<{ title: string; url: string; headings: string[]; text: string }> = [];

  for (const doc of await getCollection('docs')) {
    const markdown = doc.body ?? '';
    const route = routeForDocPath(`${doc.id}.md`);
    entries.push({
      title: markdownTitle(markdown, doc.id),
      url: `${BASE}/docs/${route ? `${route}/` : ''}`,
      headings: markdownHeadings(markdown).slice(1),
      text: markdownToText(markdown),
    });
  }

  entries.push({
    title: 'Glossary',
    url: `${BASE}/docs/glossary/`,
    headings: [],
    text: GLOSSARY.map((entry) => `${entry.term} ${entry.definition}`).join(' '),
  });

  const legacyDir = path.resolve(process.cwd(), 'public/v1');
  for (const file of (await readdir(legacyDir)).filter((name) => name.endsWith('.html') && name !== 'search.html').sort()) {
    const html = await readFile(path.join(legacyDir, file), 'utf8');
    entries.push({
      title: `${htmlTitle(html, file)} (v1)`,
      url: `${BASE}/v1/${file}`,
      headings: htmlHeadings(html),
      text: htmlToText(html),
    });
  }

  entries.sort((a, b) => a.url.localeCompare(b.url));
  return new Response(JSON.stringify(entries), { headers: { 'content-type': 'application/json' } });
};
