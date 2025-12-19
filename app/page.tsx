"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryState } from "nuqs";
import {
  FileItem,
  getFilesCache,
  appendToFilesCache,
} from "@/lib/cache";
import {
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
} from "@/lib/celebrity-data";
import { CelebrityCombobox } from "@/components/celebrity-combobox";

const WORKER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://epstein-files.rhys-669.workers.dev";

interface FilesResponse {
  files: FileItem[];
  truncated: boolean;
  cursor: string | null;
  totalReturned: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

// Thumbnail component - loads precomputed thumbnail from R2
function PdfThumbnail({ fileKey }: { fileKey: string }) {
  const [error, setError] = useState(false);
  // Convert PDF path to thumbnail path: VOL00001/IMAGES/0001/EFTA00000001.pdf -> thumbnails/VOL00001/IMAGES/0001/EFTA00000001.jpg
  const thumbnailUrl = `${WORKER_URL}/thumbnails/${fileKey.replace(".pdf", ".jpg")}`;

  if (error) {
    return (
      <div className="h-32 bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center">
        <svg
          className="w-12 h-12 text-red-500"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="h-32 bg-zinc-800 rounded-lg overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt="PDF thumbnail"
        className="w-full h-full object-cover object-top"
        loading="lazy"
        onError={() => setError(true)}
      />
    </div>
  );
}

// File card component
function FileCard({ file }: { file: FileItem }) {
  return (
    <a
      href={`/file/${encodeURIComponent(file.key)}`}
      className="group bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all"
    >
      <div className="mb-3 group-hover:opacity-90 transition-opacity">
        <PdfThumbnail fileKey={file.key} />
      </div>

      <div className="space-y-1">
        <h3
          className="font-mono text-sm text-white truncate"
          title={getFileId(file.key)}
        >
          {getFileId(file.key)}
        </h3>
        <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
      </div>
    </a>
  );
}

// Calculate columns based on container width
function useColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(5);

  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      if (width < 640) setColumns(1);
      else if (width < 768) setColumns(2);
      else if (width < 1024) setColumns(3);
      else if (width < 1280) setColumns(4);
      else setColumns(5);
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [containerRef]);

  return columns;
}

export default function Home() {
  const cachedData = getFilesCache();
  const [files, setFiles] = useState<FileItem[]>(cachedData.files);
  const [loading, setLoading] = useState(cachedData.files.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(cachedData.cursor);
  const [hasMore, setHasMore] = useState(cachedData.hasMore);

  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });
  const [celebrityFilter, setCelebrityFilter] = useQueryState("celebrity", {
    defaultValue: "All",
  });

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99);

  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(parentRef);

  // Fetch files from R2 listing (paginated)
  const fetchFiles = useCallback(async (cursorParam?: string, prefix?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (cursorParam) params.set("cursor", cursorParam);
      if (prefix) params.set("prefix", prefix);

      const response = await fetch(`${WORKER_URL}/api/files?${params}`);
      if (!response.ok) throw new Error("Failed to fetch files");

      const data: FilesResponse = await response.json();

      if (cursorParam) {
        setFiles((prev) => {
          const existingKeys = new Set(prev.map((f) => f.key));
          const uniqueNewFiles = data.files.filter(
            (f) => !existingKeys.has(f.key)
          );
          if (!prefix) {
            appendToFilesCache(data.files, data.cursor, data.truncated);
          }
          return [...prev, ...uniqueNewFiles];
        });
      } else {
        setFiles(data.files);
        if (!prefix) {
          appendToFilesCache(data.files, data.cursor, data.truncated);
        }
      }

      setCursor(data.cursor);
      setHasMore(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch files by specific keys (for celebrity filter)
  const fetchFilesByKeys = useCallback(async (keys: string[]) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${WORKER_URL}/api/files-by-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!response.ok) throw new Error("Failed to fetch files");

      const data: { files: FileItem[]; totalReturned: number } = await response.json();
      setFiles(data.files);
      setCursor(null);
      setHasMore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch files on initial load (only for "All" collection and no celebrity filter)
  useEffect(() => {
    if (files.length === 0 && collectionFilter === "All" && celebrityFilter === "All") {
      fetchFiles();
    }
  }, [fetchFiles, files.length, collectionFilter, celebrityFilter]);

  // Handle filter changes
  useEffect(() => {
    // Celebrity filter takes precedence
    if (celebrityFilter !== "All") {
      const celebrityFileKeys = getFilesForCelebrity(celebrityFilter, 99);
      // Optionally filter by collection too
      const filteredKeys = collectionFilter === "All" 
        ? celebrityFileKeys 
        : celebrityFileKeys.filter(key => key.startsWith(collectionFilter));
      fetchFilesByKeys(filteredKeys);
      return;
    }

    // No celebrity filter - use regular listing
    const prefix = collectionFilter === "All" ? undefined : collectionFilter;
    if (collectionFilter === "All" && cachedData.files.length > 0) {
      // Use cached data for "All"
      setFiles(cachedData.files);
      setCursor(cachedData.cursor);
      setHasMore(cachedData.hasMore);
    } else {
      // Fetch fresh data for specific collection
      setFiles([]);
      setCursor(null);
      setHasMore(true);
      fetchFiles(undefined, prefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionFilter, celebrityFilter]);

  const filteredFiles = files;

  // Group files into rows for virtualization
  const rows: FileItem[][] = [];
  for (let i = 0; i < filteredFiles.length; i += columns) {
    rows.push(filteredFiles.slice(i, i + columns));
  }

  const virtualizer = useVirtualizer({
    count: rows.length + (hasMore ? 1 : 0), // +1 for load more trigger
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220, // Approximate row height
    overscan: 2,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Load more when we reach the end (only for non-celebrity filtered views)
  useEffect(() => {
    // Don't paginate when celebrity filter is active (all results loaded at once)
    if (celebrityFilter !== "All") return;
    
    const lastItem = virtualRows[virtualRows.length - 1];
    if (!lastItem) return;

    // If we're showing the last row and there's more to load
    if (lastItem.index >= rows.length - 1 && hasMore && !loading && cursor) {
      const prefix = collectionFilter === "All" ? undefined : collectionFilter;
      fetchFiles(cursor, prefix);
    }
  }, [virtualRows, rows.length, hasMore, loading, cursor, fetchFiles, collectionFilter, celebrityFilter]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">
              Epstein Files Browser
            </h1>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label="View source on GitHub"
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>

          <div className="flex gap-4 items-center flex-wrap">
            <div>
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">VOL00001</option>
                <option value="VOL00002">VOL00002</option>
                <option value="VOL00003">VOL00003</option>
                <option value="VOL00004">VOL00004</option>
              </select>
            </div>
            <CelebrityCombobox
              celebrities={celebrities}
              value={celebrityFilter}
              onValueChange={(value) => setCelebrityFilter(value)}
            />

            <div className="text-sm text-zinc-400">
              {files.length.toLocaleString()} files loaded
              {(collectionFilter !== "All" || celebrityFilter !== "All") && ` (${filteredFiles.length} matching)`}
            </div>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== "All" && (
        <div className="max-w-7xl mx-auto px-4 pt-4 shrink-0">
          <div className="bg-amber-900/30 border border-amber-700/50 text-amber-200 px-4 py-3 rounded-lg text-sm">
            Celebrity detection is done via{" "}
            <a
              href="https://aws.amazon.com/rekognition/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-100"
            >
              AWS Rekognition
            </a>
            . It may not be accurate and I have not vetted them. These are limited to results that AWS Rekognition reported with {">"}99% confidence.
          </div>
        </div>
      )}

      {/* Virtualized Grid */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const isLoaderRow = virtualRow.index >= rows.length;
              const row = rows[virtualRow.index];

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {isLoaderRow ? (
                    <div className="flex justify-center py-8">
                      {loading ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-white"></div>
                      ) : hasMore ? (
                        <button
                          onClick={() => cursor && fetchFiles(cursor, collectionFilter === "All" ? undefined : collectionFilter)}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
                        >
                          Load more
                        </button>
                      ) : (
                        <span className="text-zinc-500">
                          All {files.length.toLocaleString()} files loaded
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="grid gap-4"
                      style={{
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      }}
                    >
                      {row.map((file) => (
                        <FileCard key={file.key} file={file} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty states */}
          {!loading && files.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-500">No files found</p>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
