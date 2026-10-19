/** Builds search index entries from Markdown and from the hand-written HTML pages. Runs at build time only. */

const decodeEntities = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** Plain text of a Markdown document. Code text is kept, because flag and field names live in code. */
export const markdownToText = (markdown) =>
  markdown
    .replace(/^```.*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Headings outside fenced code blocks, as plain text. */
export const markdownHeadings = (markdown) => {
  const headings = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    const match = !inFence && line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) headings.push(markdownToText(match[1]));
  }
  return headings;
};

export const markdownTitle = (markdown, fallback) => markdownHeadings(markdown)[0] ?? fallback;

/** Plain text of an HTML page, without scripts, styles or tags. */
export const htmlToText = (html) =>
  decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

export const htmlTitle = (html, fallback) => {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? htmlToText(match[1]) : fallback;
};

export const htmlHeadings = (html) =>
  [...html.matchAll(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi)].map((match) => htmlToText(match[1]));
