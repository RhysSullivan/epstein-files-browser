// Shared constants for the application

export const WORKER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://epstein-files.rhys-669.workers.dev";

// PDF rendering settings
export const PDF_RENDER_SCALE = 2;

// Celebrity detection confidence threshold (percentage)
export const CELEBRITY_CONFIDENCE_THRESHOLD = 99;

// Cache settings
export const PDF_CACHE_MAX_ENTRIES = 20; // Maximum PDFs to keep in memory
export const THUMBNAIL_CACHE_MAX_ENTRIES = 500;

// File ID extraction pattern
export const FILE_ID_PATTERN = /EFTA\d+/;

// Helper to extract file ID from path
export function getFileId(key: string): string {
  const match = key.match(FILE_ID_PATTERN);
  return match ? match[0] : key;
}

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
