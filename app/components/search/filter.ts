/** Lowercase and strip accents, so "Cafe" finds "café". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Whether `text` contains every word of `query` (case- and accent-insensitive). An empty query
 * matches everything. For filtering lists already on screen; /api/search does the full search.
 */
export function matchesFilter(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(text);
  return words.every((w) => hay.includes(w));
}
