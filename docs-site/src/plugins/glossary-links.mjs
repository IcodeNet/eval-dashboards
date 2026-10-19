import { fileURLToPath } from 'node:url';
import { defineMdastPlugin } from 'satteri';

const BASE = '/eval-dashboards';

/**
 * Words that point at a glossary entry. Only whole words match, case-insensitive. A term links the first
 * time it appears on a page, in running text only: never in headings, code, tables or existing links.
 */
export const GLOSSARY_PATTERNS = [
  { id: 'evidence-bundle', pattern: /\bevidence bundles?\b/i },
  { id: 'persistent-failure', pattern: /\bpersistent failures?\b/i },
  { id: 'newly-failing', pattern: /\bnewly failing\b/i },
  { id: 'champion-baseline', pattern: /\bchampion baseline\b/i },
  { id: 'rolling-baseline', pattern: /\brolling baseline\b/i },
  { id: 'taxonomy', pattern: /\btaxonomy\b/i },
  { id: 'baseline', pattern: /\bbaselines?\b/i },
  { id: 'waiver', pattern: /\bwaivers?\b/i },
  { id: 'heartbeat', pattern: /\bheartbeats?\b/i },
  { id: 'disappeared', pattern: /\bdisappeared\b/i },
  { id: 'redaction', pattern: /\bredaction\b/i },
  { id: 'artifact', pattern: /\bartifacts?\b/i },
  { id: 'gate', pattern: /\bgates?\b/i },
];

/** First glossary hit in `text`, or undefined. Earlier text wins; on a tie the longer pattern wins. */
export const findGlossaryHit = (text, patterns, alreadyLinked) => {
  let best;
  for (const { id, pattern } of patterns) {
    if (alreadyLinked.has(id)) continue;
    const match = pattern.exec(text);
    if (!match) continue;
    const hit = { id, index: match.index, length: match[0].length };
    if (!best || hit.index < best.index || (hit.index === best.index && hit.length > best.length)) best = hit;
  }
  return best;
};

/** Splits `text` into text and link nodes for the glossary hits it contains. Mutates `alreadyLinked`. */
export const linkGlossaryTerms = (text, patterns, alreadyLinked) => {
  const nodes = [];
  let rest = text;
  for (;;) {
    const hit = findGlossaryHit(rest, patterns, alreadyLinked);
    if (!hit) break;
    if (hit.index > 0) nodes.push({ type: 'text', value: rest.slice(0, hit.index) });
    nodes.push({
      type: 'link',
      url: `${BASE}/docs/glossary/#${hit.id}`,
      children: [{ type: 'text', value: rest.slice(hit.index, hit.index + hit.length) }],
    });
    alreadyLinked.add(hit.id);
    rest = rest.slice(hit.index + hit.length);
  }
  if (rest.length > 0) nodes.push({ type: 'text', value: rest });
  return nodes;
};

const DOCS_ROOT = fileURLToPath(new URL('../../../docs/', import.meta.url));

/**
 * Links the first use of each glossary term in a paragraph's own text. This is a plugin factory, which
 * Sätteri calls once per document, so each page keeps its own set of already-linked terms.
 */
export const glossaryLinks = (factoryContext) => {
  if (!factoryContext.fileURL || !fileURLToPath(factoryContext.fileURL).startsWith(DOCS_ROOT)) return null;
  const linked = new Set();
  return defineMdastPlugin({
    name: 'glossary-links',
    paragraph(node, ctx) {
      for (const child of node.children) {
        if (child.type !== 'text') continue;
        const nodes = linkGlossaryTerms(child.value, GLOSSARY_PATTERNS, linked);
        if (nodes.length === 1 && nodes[0].type === 'text') continue;
        ctx.replaceNode(child, nodes);
      }
    },
  });
};
