"use client";

import { use, useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getPdfPages, setPdfPages } from "@/lib/cache";
import { useFiles } from "@/lib/files-context";
import { getFileId, WORKER_URL, PDF_RENDER_SCALE } from "@/lib/constants";
import { prefetchPdf, getFileUrl } from "@/lib/pdf-utils";
import { getCelebritiesForPage } from "@/lib/celebrity-utils";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";

// Component to display a page with its celebrity info
function PageWithCelebrities({
  dataUrl,
  pageNumber,
  filePath,
}: {
  dataUrl: string;
  pageNumber: number;
  filePath: string;
}) {
  const celebrities = useMemo(
    () => getCelebritiesForPage(filePath, pageNumber),
    [filePath, pageNumber]
  );
  const fileId = getFileId(filePath);

  return (
    <div className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
      <div className="relative">
        {/* Page number badge */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-background/80 backdrop-blur-sm rounded-lg text-xs font-medium text-muted-foreground border border-border">
          Page {pageNumber}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`Page ${pageNumber} of ${fileId}`}
          className="w-full h-auto md:max-h-[75vh] md:w-auto md:mx-auto"
          style={{ maxWidth: "100%" }}
        />
      </div>
      {celebrities.length > 0 && (
        <div className="bg-secondary/50 border-t border-border px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"
              aria-hidden="true"
            >
              <svg
                className="w-3.5 h-3.5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">
              Detected in this image:
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {celebrities.map((celeb, idx) => (
              <Link
                key={idx}
                prefetch={false}
                href={`/?celebrity=${encodeURIComponent(celeb.name)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-card border border-border text-foreground hover:bg-accent hover:border-primary/30 transition-all duration-200"
              >
                <span>{celeb.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({Math.round(celeb.confidence)}%)
                </span>
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
  const filters = useMemo(
    () => ({
      collection: collectionFilter,
      celebrity: celebrityFilter,
    }),
    [collectionFilter, celebrityFilter]
  );

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

  const fileUrl = getFileUrl(filePath);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
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
          const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

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
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link
              prefetch={false}
              href={`/${queryString}`}
              className="p-2 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 flex-shrink-0"
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
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-mono font-semibold text-foreground truncate">
                {fileId}
              </h1>
              {totalPages > 0 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <div
                    className="h-1.5 flex-1 max-w-[120px] bg-secondary rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={pages.length}
                    aria-valuemin={0}
                    aria-valuemax={totalPages}
                    aria-label="PDF loading progress"
                  >
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(pages.length / totalPages) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {pages.length}/{totalPages}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-2 flex-shrink-0" aria-label="File navigation">
            {prevPath && (
              <Link
                prefetch={false}
                href={`/file/${encodeURIComponent(prevPath)}${queryString}`}
                className="p-2 sm:px-4 sm:py-2 bg-secondary hover:bg-accent rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
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
                    strokeWidth={2}
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
                className="p-2 sm:px-4 sm:py-2 bg-secondary hover:bg-accent rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
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
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            )}
            <a
              href={fileUrl}
              download
              className="p-2 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-primary/20"
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
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </a>
          </nav>
        </div>
      </header>

      {/* PDF Pages */}
      <main ref={containerRef} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24">
        {error && (
          <div
            className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-2xl mb-6 flex items-start gap-3"
            role="alert"
          >
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium">Error loading PDF</p>
              <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6">
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
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            <div className="relative" aria-hidden="true">
              <div className="w-12 h-12 rounded-full border-2 border-secondary"></div>
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-foreground font-medium" role="status" aria-live="polite">
              {pages.length > 0
                ? `Rendering page ${pages.length + 1} of ${totalPages}`
                : "Loading PDF..."}
            </p>
          </div>
        )}
      </main>

      {/* Navigation bar */}
      <nav
        className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-2 bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-lg"
        aria-label="File navigation"
      >
        {prevPath ? (
          <Link
            prefetch={false}
            href={`/file/${encodeURIComponent(prevPath)}${queryString}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
          >
            <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">
              ←
            </kbd>
            <span>Prev</span>
          </Link>
        ) : (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed"
            aria-disabled="true"
          >
            <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md font-mono text-xs text-muted-foreground/50">
              ←
            </kbd>
            <span>Prev</span>
          </div>
        )}
        <div className="w-px h-4 bg-border" aria-hidden="true"></div>
        {nextPath ? (
          <Link
            prefetch={false}
            href={`/file/${encodeURIComponent(nextPath)}${queryString}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
          >
            <span>Next</span>
            <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">
              →
            </kbd>
          </Link>
        ) : (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed"
            aria-disabled="true"
          >
            <span>Next</span>
            <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md font-mono text-xs text-muted-foreground/50">
              →
            </kbd>
          </div>
        )}
      </nav>
    </div>
  );
}
