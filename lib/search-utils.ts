import { Celebrity, CelebrityAppearance } from "./celebrity-data";

export interface SearchResult {
  type: "celebrity" | "document";
  name: string;
  value: string;
  matches: number;
  data?: Celebrity | CelebrityAppearance;
}

/**
 * Search across celebrities and their document appearances
 */
export function searchCelebrities(
  query: string,
  celebrities: Celebrity[]
): SearchResult[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  celebrities.forEach((celebrity) => {
    // Search celebrity names
    if (celebrity.name.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: "celebrity",
        name: celebrity.name,
        value: celebrity.name,
        matches: celebrity.count,
        data: celebrity,
      });
    }

    // Search document filenames
    celebrity.appearances.forEach((appearance) => {
      if (appearance.file.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: "document",
          name: appearance.file,
          value: appearance.file,
          matches: 1,
          data: appearance,
        });
      }
    });
  });

  return results;
}

/**
 * Extract date from document filename or path
 * Formats like EFTA00003324 or VOL00002/IMAGES/0001/EFTA00003324.pdf
 */
export function extractDateFromFilename(filename: string): Date | null {
  // Try to extract EFTA number
  const match = filename.match(/EFTA(\d+)/);
  if (!match) return null;

  const number = parseInt(match[1]);
  // Very approximate: assuming sequential numbering based on processing order
  // This is a placeholder - actual dates would need metadata
  const baseDate = new Date("2024-01-01");
  baseDate.setDate(baseDate.getDate() + Math.floor(number / 10));
  return baseDate;
}

/**
 * Group celebrities by frequency (for visualization)
 */
export function getTopCelebrities(
  celebrities: Celebrity[],
  limit: number = 20
): Celebrity[] {
  return celebrities
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Find co-occurrences between celebrities (appear in same document)
 */
export interface CelebrityLink {
  source: string;
  target: string;
  connections: number;
  commonDocuments: string[];
}

export function findCelebrityConnections(
  celebrities: Celebrity[]
): CelebrityLink[] {
  const links: Map<string, CelebrityLink> = new Map();
  const fileToNames: Map<string, string[]> = new Map();

  // Build mapping of files to celebrities
  celebrities.forEach((celebrity) => {
    celebrity.appearances.forEach((appearance) => {
      if (!fileToNames.has(appearance.file)) {
        fileToNames.set(appearance.file, []);
      }
      fileToNames.get(appearance.file)!.push(celebrity.name);
    });
  });

  // Find connections
  fileToNames.forEach((names, file) => {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const source = names[i];
        const target = names[j];
        const key = [source, target].sort().join("↔");

        if (!links.has(key)) {
          links.set(key, {
            source,
            target,
            connections: 0,
            commonDocuments: [],
          });
        }

        const link = links.get(key)!;
        link.connections++;
        link.commonDocuments.push(file);
      }
    }
  });

  return Array.from(links.values())
    .sort((a, b) => b.connections - a.connections);
}
