import { CELEBRITY_DATA, type Celebrity } from "./celebrity-data";
import { CELEBRITY_CONFIDENCE_THRESHOLD } from "./constants";

// Type for celebrity appearance on a specific page
export interface PageCelebrity {
  name: string;
  confidence: number;
}

// Create a lookup key for file+page combination
function createLookupKey(filePath: string, pageNumber: number): string {
  return `${filePath}:${pageNumber}`;
}

// Build an indexed map for O(1) lookups of celebrities by file+page
// This is built once and reused for all lookups
let celebrityPageIndex: Map<string, PageCelebrity[]> | null = null;

function buildCelebrityPageIndex(): Map<string, PageCelebrity[]> {
  if (celebrityPageIndex) {
    return celebrityPageIndex;
  }

  const index = new Map<string, PageCelebrity[]>();

  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      // Only index appearances above the confidence threshold
      if (appearance.confidence >= CELEBRITY_CONFIDENCE_THRESHOLD) {
        const key = createLookupKey(appearance.file, appearance.page);
        const existing = index.get(key) || [];
        existing.push({
          name: celebrity.name,
          confidence: appearance.confidence,
        });
        index.set(key, existing);
      }
    }
  }

  // Sort each page's celebrities by confidence (highest first)
  for (const [key, celebrities] of index) {
    celebrities.sort((a, b) => b.confidence - a.confidence);
    index.set(key, celebrities);
  }

  celebrityPageIndex = index;
  return index;
}

/**
 * Get celebrities detected on a specific page of a file
 * Uses O(1) indexed lookup instead of O(n*m) nested loop
 */
export function getCelebritiesForPage(
  filePath: string,
  pageNumber: number
): PageCelebrity[] {
  const index = buildCelebrityPageIndex();
  const key = createLookupKey(filePath, pageNumber);
  return index.get(key) || [];
}

/**
 * Check if a file has any celebrity appearances
 */
export function fileHasCelebrities(filePath: string): boolean {
  const index = buildCelebrityPageIndex();

  // Check all possible pages (we don't know page count, but index has all keys)
  for (const key of index.keys()) {
    if (key.startsWith(`${filePath}:`)) {
      return true;
    }
  }
  return false;
}

/**
 * Get all unique celebrities across a file
 */
export function getCelebritiesForFile(filePath: string): PageCelebrity[] {
  const index = buildCelebrityPageIndex();
  const seen = new Map<string, PageCelebrity>();

  for (const [key, celebrities] of index) {
    if (key.startsWith(`${filePath}:`)) {
      for (const celeb of celebrities) {
        // Keep the highest confidence for each celebrity
        const existing = seen.get(celeb.name);
        if (!existing || celeb.confidence > existing.confidence) {
          seen.set(celeb.name, celeb);
        }
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

// Re-export useful functions from celebrity-data for convenience
export {
  CELEBRITY_DATA,
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
  type Celebrity,
  type CelebrityAppearance
} from "./celebrity-data";
