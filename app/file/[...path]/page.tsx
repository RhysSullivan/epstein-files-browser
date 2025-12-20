"use client";

import { use, useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getPdfPages, setPdfPages } from "@/lib/cache";
import { FadeInImage } from "@/components/progressive-image";
import { useFiles } from "@/lib/files-context";
import { CELEBRITY_DATA } from "@/lib/celebrity-data";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";

const WORKER_URL = process.env.NODE_ENV === "development" 
  ? "http://localhost:8787" 
  : "https://epstein-files.rhys-669.workers.dev";

// Track in-progress prefetch operations to avoid duplicates
const prefetchingSet = new Set<string>();

async function prefetchPdf(filePath: string): Promise<void> {
  // Skip if already cached or already prefetching
  if (getPdfPages(filePath) || prefetchingSet.has(filePath)) {
    return;
  }

  prefetchingSet.add(filePath);

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

      const dataUrl = canvas.toDataURL("image/png");
      renderedPages.push(dataUrl);
    }

    if (renderedPages.length > 0) {
      setPdfPages(filePath, renderedPages);
    }
  } catch {
    // Silently fail prefetch - it's just an optimization
  } finally {
    prefetchingSet.delete(filePath);
  }
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

// Get celebrities for a specific file and page
function getCelebritiesForPage(filePath: string, pageNumber: number): { name: string; confidence: number }[] {
  const celebrities: { name: string; confidence: number }[] = [];
  
  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      // The appearance.file contains paths like "VOL00002/IMAGES/0001/EFTA00003324.pdf"
      // filePath also should be in similar format
      if (appearance.file === filePath && appearance.page === pageNumber) {
        celebrities.push({
          name: celebrity.name,
          confidence: appearance.confidence
        });
      }
    }
  }
  
  // Sort by confidence (highest first)
  return celebrities.sort((a, b) => b.confidence - a.confidence).filter(celeb => celeb.confidence > 99);
}

// Component to display a page with its celebrity info
function PageWithCelebrities({
  dataUrl,
  pageNumber,
  filePath
}: {
  dataUrl: string;
  pageNumber: number;
  filePath: string;
}) {
  const celebrities = useMemo(() => getCelebritiesForPage(filePath, pageNumber), [filePath, pageNumber]);

  return (
    <div className="bg-card rounded-lg overflow-hidden border border-border/60">
      <div className="relative">
        {/* Page number badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-background/90 backdrop-blur-sm rounded text-[11px] font-mono text-muted-foreground border border-border/40">
          {pageNumber}
        </div>
        <FadeInImage
          src={dataUrl}
          alt={`Page ${pageNumber}`}
          className="w-full h-auto md:max-h-[75vh] md:w-auto md:mx-auto"
          style={{ maxWidth: "100%" }}
        />
      </div>
      {celebrities.length > 0 && (
        <div className="bg-secondary/30 border-t border-border/40 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">Detected:</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {celebrities.map((celeb, idx) => (
              <Link
                key={idx}
                prefetch={false}
                href={`/?celebrity=${encodeURIComponent(celeb.name)}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-card border border-border/60 text-foreground/90 hover:border-primary/40 transition-colors"
              >
                <span>{celeb.name}</span>
                <span className="text-muted-foreground tabular-nums">{Math.round(celeb.confidence)}%</span>
              </Link>
            ))}
          </div>
          <CelebrityDisclaimer />
        </div>
      )}
    </div>
  );
}

export default function FilePage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = use(params);
  const filePath = decodeURIComponent(path.join("/"));
  const fileId = getFileId(filePath);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAdjacentFile } = useFiles();
  
  // Get filter params for navigation
  const collectionFilter = searchParams.get("collection") ?? "All";
  const celebrityFilter = searchParams.get("celebrity") ?? "All";
  const filters = useMemo(() => ({ 
    collection: collectionFilter, 
    celebrity: celebrityFilter 
  }), [collectionFilter, celebrityFilter]);
  
  // Get adjacent file paths from context, respecting filters
  const prevPath = getAdjacentFile(filePath, -1, filters);
  const nextPath = getAdjacentFile(filePath, 1, filters);
  
  // Build query string to preserve filters in navigation
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (collectionFilter !== "All") params.set("collection", collectionFilter);
    if (celebrityFilter !== "All") params.set("celebrity", celebrityFilter);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [collectionFilter, celebrityFilter]);

  const fileUrl = `${WORKER_URL}/${filePath}`;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft" && prevPath) {
        router.push(`/file/${encodeURIComponent(prevPath)}${queryString}`);
      } else if (e.key === "ArrowRight" && nextPath) {
        router.push(`/file/${encodeURIComponent(nextPath)}${queryString}`);
      }
    },
    [prevPath, nextPath, router, queryString]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Check cache immediately to avoid loading flash for prefetched PDFs
  const cachedPages = getPdfPages(filePath);
  const [pages, setPages] = useState<string[]>(cachedPages ?? []);
  const [loading, setLoading] = useState(!cachedPages);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(cachedPages?.length ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check cache for pre-rendered pages
    const cached = getPdfPages(filePath);
    
    // Already have cached pages
    if (cached && cached.length > 0) {
      setPages(cached);
      setTotalPages(cached.length);
      setLoading(false);
      return;
    }

    // Reset state for new file (only if not cached)
    setPages([]);
    setError(null);
    setLoading(true);
    setTotalPages(0);

    let cancelled = false;

    async function loadPdf() {

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        setTotalPages(pdf.numPages);

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

          // Update state progressively
          setPages([...renderedPages]);
        }

        // Cache all pages when done
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

  // Prefetch adjacent PDFs after current one is loaded
  useEffect(() => {
    if (loading) return;

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    // Small delay to let the UI settle, then start prefetching
    const prefetchTimeout = setTimeout(() => {
      // Prefetch next first (more likely to be navigated to)
      if (nextPath) {
        prefetchPdf(nextPath);
      }

      // Then prefetch previous
      if (prevPath) {
        // Slight delay so next gets priority
        timeoutIds.push(setTimeout(() => prefetchPdf(prevPath), 500));
      }
    }, 100);

    timeoutIds.push(prefetchTimeout);

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [loading, nextPath, prevPath]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              prefetch={false}
              href={`/${queryString}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex-shrink-0"
              aria-label="Back to file list"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-mono font-medium text-foreground/90 truncate tracking-tight">{fileId}</h1>
              {totalPages > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 flex-1 max-w-[100px] bg-secondary/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/80 rounded-full transition-all duration-500"
                      style={{ width: `${(pages.length / totalPages) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                    {pages.length}/{totalPages}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {prevPath && (
              <Link
                prefetch={false}
                href={`/file/${encodeURIComponent(prevPath)}${queryString}`}
                className="p-2 sm:px-3 sm:py-1.5 bg-secondary/80 hover:bg-secondary rounded-md text-sm transition-colors flex items-center gap-2"
                aria-label="Previous file"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="hidden sm:inline">Prev</span>
              </Link>
            )}
            {nextPath && (
              <Link
                prefetch={false}
                href={`/file/${encodeURIComponent(nextPath)}${queryString}`}
                className="p-2 sm:px-3 sm:py-1.5 bg-secondary/80 hover:bg-secondary rounded-md text-sm transition-colors flex items-center gap-2"
                aria-label="Next file"
              >
                <span className="hidden sm:inline">Next</span>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            )}
            <a
              href={fileUrl}
              download
              className="p-2 sm:px-3 sm:py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              aria-label="Download PDF"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        </div>
      </header>

      {/* PDF Pages */}
      <main ref={containerRef} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24">
        {error && (
          <div className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md mb-6 flex items-start gap-3">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium">Error loading PDF</p>
              <p className="text-destructive/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-4">
          {pages.map((dataUrl, index) => (
            <PageWithCelebrities
              key={index}
              dataUrl={dataUrl}
              pageNumber={index + 1}
              filePath={filePath}
            />
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-8 h-8 rounded-full border border-border"></div>
              <div className="absolute inset-0 w-8 h-8 rounded-full border border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-muted-foreground">
              {pages.length > 0
                ? `Rendering page ${pages.length + 1} of ${totalPages}`
                : "Loading document..."}
            </p>
          </div>
        )}
      </main>

      {/* Navigation bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1 py-1 bg-card/95 backdrop-blur-md border border-border/60 rounded-lg shadow-lg">
        {prevPath ? (
          <Link
            prefetch={false}
            href={`/file/${encodeURIComponent(prevPath)}${queryString}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-md transition-colors"
          >
            <kbd className="px-1.5 py-0.5 bg-secondary/80 rounded font-mono text-[10px]">←</kbd>
            <span>Prev</span>
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed">
            <kbd className="px-1.5 py-0.5 bg-secondary/40 rounded font-mono text-[10px]">←</kbd>
            <span>Prev</span>
          </div>
        )}
        <div className="w-px h-4 bg-border/60"></div>
        {nextPath ? (
          <Link
            prefetch={false}
            href={`/file/${encodeURIComponent(nextPath)}${queryString}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-md transition-colors"
          >
            <span>Next</span>
            <kbd className="px-1.5 py-0.5 bg-secondary/80 rounded font-mono text-[10px]">→</kbd>
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed">
            <span>Next</span>
            <kbd className="px-1.5 py-0.5 bg-secondary/40 rounded font-mono text-[10px]">→</kbd>
          </div>
        )}
      </div>
    </div>
  );
}
