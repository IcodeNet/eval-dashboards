/**
 * Search over the prebuilt index. Shared by the browser dialog and the tests, so what the tests prove
 * is what readers get. No dependencies, no network.
 */

/** Lower-case terms of a query; empty when the query is blank. */
export const tokenize = (query) => query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);

const countOccurrences = (haystack, term) => {
  let count = 0;
  let from = haystack.indexOf(term);
  while (from !== -1 && count < 20) {
    count += 1;
    from = haystack.indexOf(term, from + term.length);
  }
  return count;
};

/**
 * Pages that contain every term, best first. A term in the title scores 20, in a heading 6, and in the
 * body 1 per occurrence up to 5. A title that is exactly the query adds 30, so the page named "Gates" comes
 * before a page that only mentions gates. Ties sort by title so the order is stable.
 */
export const searchIndex = (entries, query) => {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const wholeQuery = terms.join(' ');
  const hits = [];
  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const headings = entry.headings.join(' \n ').toLowerCase();
    const text = entry.text.toLowerCase();
    let score = title.replace(/\s*\(v1\)$/, '') === wholeQuery ? 30 : 0;
    let matchesAll = true;
    for (const term of terms) {
      const inTitle = title.includes(term);
      const inHeadings = headings.includes(term);
      const bodyCount = countOccurrences(text, term);
      if (!inTitle && !inHeadings && bodyCount === 0) {
        matchesAll = false;
        break;
      }
      score += (inTitle ? 20 : 0) + (inHeadings ? 6 : 0) + Math.min(bodyCount, 5);
    }
    if (matchesAll) hits.push({ entry, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .map((hit) => hit.entry);
};

/** About 160 characters of body text around the first query term that appears in it. */
export const snippetFor = (entry, query) => {
  const text = entry.text;
  const lower = text.toLowerCase();
  const positions = tokenize(query)
    .map((term) => lower.indexOf(term))
    .filter((position) => position !== -1);
  if (positions.length === 0) return text.slice(0, 160).trim();
  const start = Math.max(0, Math.min(...positions) - 50);
  const slice = text.slice(start, start + 160).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + 160 < text.length ? '…' : ''}`;
};
