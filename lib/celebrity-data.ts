import celebrityResults from "../celebrity-results.json";

export interface CelebrityAppearance {
  file: string;
  page: number;
  confidence: number;
}

export interface Celebrity {
  name: string;
  count: number;
  appearances: CelebrityAppearance[];
}

// Transform the JSON data into the format we need
function transformData(): Celebrity[] {
  const celebrities: Celebrity[] = [];

  for (const [name, appearances] of Object.entries(celebrityResults.celebrityAppearances)) {
    // Transform file paths from absolute to relative format
    // From: /Users/.../files/VOL00002/IMAGES/0001/EFTA00003188.pdf
    // To: VOL00002/IMAGES/0001/EFTA00003188.pdf
    const transformedAppearances: CelebrityAppearance[] = appearances.map((app) => {
      const match = app.file.match(/(VOL\d+\/.*)/);
      const relativePath = match ? match[1] : app.file;

      return {
        file: relativePath,
        page: app.page,
        confidence: app.confidence,
      };
    });

    celebrities.push({
      name,
      count: transformedAppearances.length,
      appearances: transformedAppearances,
    });
  }

  // Sort by count descending (most appearances first)
  celebrities.sort((a, b) => b.count - a.count);

  return celebrities;
}

export const CELEBRITY_DATA: Celebrity[] = transformData();

// Helper to get files for a celebrity (filtered by confidence threshold)
export function getFilesForCelebrity(
  celebrityName: string,
  minConfidence: number = 99
): string[] {
  const celebrity = CELEBRITY_DATA.find((c) => c.name === celebrityName);
  if (!celebrity) return [];

  return celebrity.appearances
    .filter((a) => a.confidence >= minConfidence)
    .map((a) => a.file);
}

// Get celebrities filtered by minimum confidence, sorted by appearance count
export function getCelebritiesAboveConfidence(minConfidence: number = 99): Celebrity[] {
  return CELEBRITY_DATA
    .map((celebrity) => ({
      ...celebrity,
      appearances: celebrity.appearances.filter((a) => a.confidence >= minConfidence),
    }))
    .filter((celebrity) => celebrity.appearances.length > 0)
    .map((celebrity) => ({
      ...celebrity,
      count: celebrity.appearances.length,
    }))
    .sort((a, b) => b.count - a.count);
}

// Build a map of file -> celebrities for quick lookup
export function buildFileToCelebritiesMap(
  minConfidence: number = 99
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      if (appearance.confidence >= minConfidence) {
        const existing = map.get(appearance.file) || [];
        existing.push(celebrity.name);
        map.set(appearance.file, existing);
      }
    }
  }

  return map;
}
