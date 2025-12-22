/**
 * Fuzzy search utilities for matching user queries against text
 */

export interface FuzzyMatch {
  score: number;
  matches: boolean;
}

/**
 * Calculate fuzzy match score between query and text
 * Higher score = better match
 * 
 * Scoring:
 * - Exact match: 1000
 * - Starts with query: 900
 * - Contains query: 800
 * - Sequential fuzzy match: 100-700 (based on gaps)
 * - No match: 0
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  if (!query) return { score: 0, matches: false };
  
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  // Exact match (highest priority)
  if (t === q) {
    return { score: 1000, matches: true };
  }
  
  // Starts with query (very high priority)
  if (t.startsWith(q)) {
    return { score: 900, matches: true };
  }
  
  // Contains query as substring (high priority)
  if (t.includes(q)) {
    return { score: 800, matches: true };
  }
  
  // Fuzzy match - check if all query characters appear in order
  let textIndex = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let gaps = 0;
  
  while (queryIndex < q.length && textIndex < t.length) {
    if (q[queryIndex] === t[textIndex]) {
      // Calculate gap between matches
      if (lastMatchIndex >= 0) {
        gaps += textIndex - lastMatchIndex - 1;
      }
      lastMatchIndex = textIndex;
      queryIndex++;
    }
    textIndex++;
  }
  
  // All characters matched in order
  if (queryIndex === q.length) {
    // Score based on how close together the matches are
    // Fewer gaps = higher score
    const gapPenalty = Math.min(gaps * 10, 600);
    const score = 700 - gapPenalty;
    return { score: Math.max(score, 100), matches: true };
  }
  
  return { score: 0, matches: false };
}

/**
 * Search through items and return matches sorted by relevance
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getSearchText: (item: T) => string | string[],
  limit?: number
): T[] {
  if (!query.trim()) {
    return limit ? items.slice(0, limit) : items;
  }
  
  const scored = items
    .map((item) => {
      const searchTexts = Array.isArray(getSearchText(item)) 
        ? getSearchText(item) as string[]
        : [getSearchText(item) as string];
      
      // Get the best score across all search texts
      let bestScore = 0;
      for (const text of searchTexts) {
        const match = fuzzyMatch(query, text);
        if (match.score > bestScore) {
          bestScore = match.score;
        }
      }
      
      return { item, score: bestScore };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
  
  const results = scored.map((r) => r.item);
  return limit ? results.slice(0, limit) : results;
}
