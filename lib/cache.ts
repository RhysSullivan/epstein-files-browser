export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
}

interface FilesCache {
  files: FileItem[];
  cursor: string | null;
  hasMore: boolean;
}

// Global cache for files list
let filesCache: FilesCache = {
  files: [],
  cursor: null,
  hasMore: true,
};

export function getFilesCache(): FilesCache {
  return filesCache;
}

export function setFilesCache(data: FilesCache): void {
  filesCache = data;
}

export function appendToFilesCache(newFiles: FileItem[], cursor: string | null, hasMore: boolean): void {
  // Dedupe by key
  const existingKeys = new Set(filesCache.files.map(f => f.key));
  const uniqueNewFiles = newFiles.filter(f => !existingKeys.has(f.key));
  
  filesCache = {
    files: [...filesCache.files, ...uniqueNewFiles],
    cursor,
    hasMore,
  };
}

export function resetFilesCache(): void {
  filesCache = {
    files: [],
    cursor: null,
    hasMore: true,
  };
}

// Global cache for PDF thumbnails (first page renders)
const thumbnailCache = new Map<string, string>();

export function getThumbnail(key: string): string | undefined {
  return thumbnailCache.get(key);
}

export function setThumbnail(key: string, dataUrl: string): void {
  thumbnailCache.set(key, dataUrl);
}

// Global cache for full PDF page renders with LRU eviction
// Limit to 10 PDFs to allow prefetching while preventing memory bloat
const PDF_CACHE_MAX_SIZE = 10;
const pdfPagesCache = new Map<string, string[]>();

export function getPdfPages(key: string): string[] | undefined {
  const value = pdfPagesCache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used) by re-inserting
    pdfPagesCache.delete(key);
    pdfPagesCache.set(key, value);
  }
  return value;
}

export function setPdfPages(key: string, pages: string[]): void {
  // If key exists, delete first to update insertion order
  if (pdfPagesCache.has(key)) {
    pdfPagesCache.delete(key);
  }
  
  // Evict oldest entries if at capacity
  while (pdfPagesCache.size >= PDF_CACHE_MAX_SIZE) {
    const oldestKey = pdfPagesCache.keys().next().value;
    if (oldestKey) {
      pdfPagesCache.delete(oldestKey);
    }
  }
  
  pdfPagesCache.set(key, pages);
}

export function clearPdfCache(): void {
  pdfPagesCache.clear();
}

// PDF images manifest cache
export interface PdfManifestEntry {
  pages: number;
}

export type PdfManifest = Record<string, PdfManifestEntry>;

let pdfManifest: PdfManifest | null = null;

export function getPdfManifest(): PdfManifest | null {
  return pdfManifest;
}

export function setPdfManifest(manifest: PdfManifest): void {
  pdfManifest = manifest;
}

export function getPageCount(pdfKey: string): number | null {
  if (!pdfManifest) return null;
  return pdfManifest[pdfKey]?.pages ?? null;
}
