import { PDF_CACHE_MAX_ENTRIES, THUMBNAIL_CACHE_MAX_ENTRIES } from "./constants";

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

/**
 * LRU Cache implementation for memory management
 * Automatically evicts least recently used entries when capacity is reached
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Global LRU cache for PDF thumbnails (first page renders)
const thumbnailCache = new LRUCache<string, string>(THUMBNAIL_CACHE_MAX_ENTRIES);

export function getThumbnail(key: string): string | undefined {
  return thumbnailCache.get(key);
}

export function setThumbnail(key: string, dataUrl: string): void {
  thumbnailCache.set(key, dataUrl);
}

// Global LRU cache for full PDF page renders
const pdfPagesCache = new LRUCache<string, string[]>(PDF_CACHE_MAX_ENTRIES);

export function getPdfPages(key: string): string[] | undefined {
  return pdfPagesCache.get(key);
}

export function setPdfPages(key: string, pages: string[]): void {
  pdfPagesCache.set(key, pages);
}

// Clear all PDF caches (useful for memory pressure)
export function clearPdfCaches(): void {
  pdfPagesCache.clear();
  thumbnailCache.clear();
}

// Get current cache sizes for debugging
export function getCacheSizes(): { thumbnails: number; pdfPages: number } {
  return {
    thumbnails: thumbnailCache.size,
    pdfPages: pdfPagesCache.size,
  };
}
