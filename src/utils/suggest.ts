const levenshtein = (a: string, b: string): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);

  for (let i = 1; i < rows; i += 1) {
    const current = [i];

    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }

    previous = current;
  }

  return previous[cols - 1] ?? 0;
};

/** Closest candidate to `value` within 3 edits, or undefined when nothing is close enough to be useful. */
export const suggestClosest = (value: string, candidates: readonly string[]): string | undefined => {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshtein(value, candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  // Only suggest genuinely close matches, so a wild value does not get a
  // confident but useless "did you mean".
  return bestDistance <= 3 ? best : undefined;
};
