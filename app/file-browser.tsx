"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryState } from "nuqs";
import Link from "next/link";
import { FileItem, getPdfPages, setPdfPages } from "@/lib/cache";
import {
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
  CELEBRITY_DATA,
} from "@/lib/celebrity-data";
import { CelebrityCombobox } from "@/components/celebrity-combobox";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";
import { ProgressiveImage, FadeInImage } from "@/components/progressive-image";
import { useFiles } from "@/lib/files-context";

const WORKER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://epstein-files.rhys-669.workers.dev";

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

// Thumbnail component - loads thumbnail from R2 with progressive loading
function Thumbnail({ fileKey }: { fileKey: string }) {
  const thumbnailUrl = `${WORKER_URL}/thumbnails/${fileKey.replace(".pdf", ".jpg")}`;

  return (
    <ProgressiveImage
      src={thumbnailUrl}
      alt="Document thumbnail"
      className="w-full rounded-xl"
      aspectRatio="3/4"
      objectFit="cover"
      objectPosition="top"
      loading="lazy"
    />
  );
}

// File card component
function FileCard({ file, onClick }: { file: FileItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative bg-card rounded-xl overflow-hidden text-left w-full transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 280px' }}
    >
      {/* Thumbnail */}
      <div className="relative">
        <Thumbnail fileKey={file.key} />
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        {/* File ID overlay on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
          <p className="font-mono text-sm font-medium text-white drop-shadow-lg tabular-nums tracking-tight">
            {getFileId(file.key)}
          </p>
          <p className="text-xs text-white/70 tabular-nums mt-0.5">{formatFileSize(file.size)}</p>
        </div>
      </div>

      {/* Static label below thumbnail */}
      <div className="px-3 py-2.5 bg-secondary/40">
        <p className="font-mono text-xs text-muted-foreground truncate group-hover:text-foreground transition-colors tabular-nums tracking-tight">
          {getFileId(file.key)}
        </p>
      </div>
    </button>
  );
}

// Get celebrities for a specific file and page
function getCelebritiesForPage(filePath: string, pageNumber: number): { name: string; confidence: number }[] {
  const celebrities: { name: string; confidence: number }[] = [];

  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      if (appearance.file === filePath && appearance.page === pageNumber) {
        celebrities.push({
          name: celebrity.name,
          confidence: appearance.confidence
        });
      }
    }
  }

  return celebrities.sort((a, b) => b.confidence - a.confidence).filter(celeb => celeb.confidence > 99);
}

// Prefetch a PDF in the background
async function prefetchPdf(filePath: string): Promise<void> {
  if (getPdfPages(filePath)) return;

  try {
    const fileUrl = `${WORKER_URL}/${filePath}`;
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const loadingTask = pdfjsLib.getDocument(fileUrl);
    const pdf = await loadingTask.promise;

    const renderedPages: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const scale = 2;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
        canvas,
      }).promise;

      renderedPages.push(canvas.toDataURL("image/png"));
    }

    if (renderedPages.length > 0) {
      setPdfPages(filePath, renderedPages);
    }
  } catch {
    // Silently fail prefetch
  }
}

// Modal component for viewing files
function FileModal({
  file,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  queryString,
  nextFile
}: {
  file: FileItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  queryString: string;
  nextFile: FileItem | null;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filePath = file.key;
  const fileId = getFileId(filePath);
  const fileUrl = `${WORKER_URL}/${filePath}`;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        onNext();
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Load PDF
  useEffect(() => {
    const cached = getPdfPages(filePath);

    if (cached && cached.length > 0) {
      setPages(cached);
      setLoading(false);
      return;
    }

    setPages([]);
    setError(null);
    setLoading(true);

    let cancelled = false;

    async function loadPdf() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const renderedPages: string[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNum);
          const scale = 2;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport,
            canvas,
          }).promise;

          const dataUrl = canvas.toDataURL("image/png");
          renderedPages.push(dataUrl);

          setPages([...renderedPages]);
        }

        if (!cancelled && renderedPages.length > 0) {
          setPdfPages(filePath, renderedPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, filePath]);

  // Prefetch next PDF
  useEffect(() => {
    if (!loading && nextFile) {
      prefetchPdf(nextFile.key);
    }
  }, [loading, nextFile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-full h-full flex flex-col">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-xl z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h1 className="text-mono text-heading text-foreground truncate">{fileId}</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/file/${encodeURIComponent(filePath)}${queryString}`}
                className="p-2 sm:px-4 sm:py-2 bg-secondary hover:bg-accent rounded-xl text-body flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="hidden sm:inline">Open</span>
              </Link>
              <a
                href={fileUrl}
                download
                className="p-2 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-body font-medium flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Download</span>
              </a>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24">
          {error && (
            <div className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-2xl mb-6 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-subheading">Error loading PDF</p>
                <p className="text-caption text-destructive/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-6">
            {pages.map((dataUrl, index) => {
              const pageCelebrities = getCelebritiesForPage(filePath, index + 1);
              return (
                <div key={index} className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
                  <div className="relative">
                    {pages.length > 1 && (
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-background/80 backdrop-blur-sm rounded-lg text-label text-muted-foreground border border-border tabular-nums">
                        Page {index + 1}
                      </div>
                    )}
                    <FadeInImage
                      src={dataUrl}
                      alt={`Page ${index + 1}`}
                      className="w-full h-auto md:max-h-[75vh] md:w-auto md:mx-auto"
                      style={{ maxWidth: "100%" }}
                    />
                  </div>
                  {pageCelebrities.length > 0 && (
                    <div className="bg-secondary/50 border-t border-border px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <p className="text-body font-medium text-foreground">Detected in this image</p>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {pageCelebrities.map((celeb, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption bg-card border border-border text-foreground"
                          >
                            <span>{celeb.name}</span>
                            <span className="text-label text-muted-foreground tabular-nums">{Math.round(celeb.confidence)}%</span>
                          </span>
                        ))}
                      </div>
                      <CelebrityDisclaimer />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-secondary"></div>
                <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              </div>
              <p className="text-body text-muted-foreground">Loading document...</p>
            </div>
          )}
        </div>

        {/* Navigation bar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-2 bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-lg z-20">
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="flex items-center gap-1.5 px-3 py-1.5 text-caption text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
            >
              <kbd className="px-2 py-0.5 bg-secondary rounded-md text-mono text-micro text-foreground">←</kbd>
              <span>Prev</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-caption text-muted-foreground/40 cursor-not-allowed">
              <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md text-mono text-micro text-muted-foreground/40">←</kbd>
              <span>Prev</span>
            </div>
          )}
          <div className="w-px h-4 bg-border"></div>
          {hasNext ? (
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 px-3 py-1.5 text-caption text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
            >
              <span>Next</span>
              <kbd className="px-2 py-0.5 bg-secondary rounded-md text-mono text-micro text-foreground">→</kbd>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-caption text-muted-foreground/40 cursor-not-allowed">
              <span>Next</span>
              <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md text-mono text-micro text-muted-foreground/40">→</kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileBrowser() {
  const { files: initialFiles } = useFiles();

  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });
  const [celebrityFilter, setCelebrityFilter] = useQueryState("celebrity", {
    defaultValue: "All",
  });
  const [openFile, setOpenFile] = useQueryState("file");

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99);

  // Derive filtered files from initialFiles + filters
  const filteredFiles = useMemo(() => {
    let files = initialFiles;

    // Apply collection filter
    if (collectionFilter !== "All") {
      files = files.filter((f) => f.key.startsWith(collectionFilter));
    }

    // Apply celebrity filter
    if (celebrityFilter !== "All") {
      const celebrityFileKeys = new Set(getFilesForCelebrity(celebrityFilter, 99));
      files = files.filter((f) => celebrityFileKeys.has(f.key));
    }

    return files;
  }, [initialFiles, collectionFilter, celebrityFilter]);

  // Build query string to preserve filters in file links
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (collectionFilter !== "All") params.set("collection", collectionFilter);
    if (celebrityFilter !== "All") params.set("celebrity", celebrityFilter);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [collectionFilter, celebrityFilter]);

  // Modal state - find index from file key
  const selectedFileIndex = useMemo(() => {
    if (!openFile) return null;
    const index = filteredFiles.findIndex(f => f.key === openFile);
    return index >= 0 ? index : null;
  }, [openFile, filteredFiles]);

  const selectedFile = selectedFileIndex !== null ? filteredFiles[selectedFileIndex] : null;
  const hasPrev = selectedFileIndex !== null && selectedFileIndex > 0;
  const hasNext = selectedFileIndex !== null && selectedFileIndex < filteredFiles.length - 1;

  const handlePrev = useCallback(() => {
    if (selectedFileIndex !== null && selectedFileIndex > 0) {
      setOpenFile(filteredFiles[selectedFileIndex - 1].key);
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile]);

  const handleNext = useCallback(() => {
    if (selectedFileIndex !== null && selectedFileIndex < filteredFiles.length - 1) {
      setOpenFile(filteredFiles[selectedFileIndex + 1].key);
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile]);

  const handleClose = useCallback(() => {
    setOpenFile(null);
  }, [setOpenFile]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
              Epstein Files Browser
            </h1>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105"
              aria-label="View source on GitHub"
            >
              <svg
                className="w-5 h-5"
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

          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-secondary border border-border rounded-xl text-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer hover:bg-accent"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">Volume 1</option>
                <option value="VOL00002">Volume 2</option>
                <option value="VOL00003">Volume 3</option>
                <option value="VOL00004">Volume 4</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <CelebrityCombobox
              celebrities={celebrities}
              value={celebrityFilter}
              onValueChange={(value) => setCelebrityFilter(value)}
            />

            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-mono font-medium text-foreground tabular-nums">{filteredFiles.length.toLocaleString()}</span>
              {collectionFilter !== "All" || celebrityFilter !== "All" ? (
                <>
                  <span>/</span>
                  <span className="font-mono tabular-nums">{initialFiles.length.toLocaleString()}</span>
                </>
              ) : null}
              <span className="ml-0.5">documents</span>
            </div>
          </div>
        </div>
      </header>

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== "All" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary/60 border border-border rounded-full text-sm text-muted-foreground">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              AI detection via{" "}
              <a href="https://aws.amazon.com/rekognition/" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary transition-colors">
                AWS Rekognition
              </a>
              {" "}&middot; <span className="font-mono tabular-nums">&gt;99%</span> confidence &middot; Results may be inaccurate
            </span>
          </div>
        </div>
      )}

      {/* File Grid */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFiles.map((file) => (
            <FileCard key={file.key} file={file} onClick={() => setOpenFile(file.key)} />
          ))}
        </div>

        {/* Empty state */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-subheading text-foreground mb-1">No documents found</h3>
            <p className="text-caption text-muted-foreground max-w-xs">Try adjusting your filters to find what you&apos;re looking for.</p>
          </div>
        )}
      </main>

      {/* File Modal */}
      {selectedFile && (
        <FileModal
          file={selectedFile}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          queryString={queryString}
          nextFile={hasNext && selectedFileIndex !== null ? filteredFiles[selectedFileIndex + 1] : null}
        />
      )}
    </div>
  );
}
