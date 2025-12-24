import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileItem,
  getPdfManifest,
  getPdfPages,
  setPdfPages,
} from "@/lib/cache";
import { getCelebritiesForPage, getFileId } from "@/lib/utils";
import { WORKER_URL } from "@/lib/const";
import { SharePopover } from "./share-popover";
import { loadPagesFromImages, prefetchPdf } from "@/lib/prefetchPdfs";
import { CelebrityDisclaimer } from "./celebrity-disclaimer";

// Modal component for viewing files
export function FileModal({
  file,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  queryString,
  nextFiles,
}: {
  file: FileItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  queryString: string;
  nextFiles: FileItem[];
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // Touch/swipe navigation for mobile
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const swipeThreshold = 50;

      // Only trigger if horizontal swipe is dominant and exceeds threshold
      if (
        Math.abs(deltaX) > Math.abs(deltaY) &&
        Math.abs(deltaX) > swipeThreshold
      ) {
        if (deltaX > 0 && hasPrev) {
          onPrev();
        } else if (deltaX < 0 && hasNext) {
          onNext();
        }
      }

      touchStartRef.current = null;
    },
    [hasPrev, hasNext, onPrev, onNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown, handleTouchStart, handleTouchEnd]);

  // Load PDF pages (uses pre-rendered images if available, falls back to PDF rendering)
  useEffect(() => {
    // Always reset state immediately when file changes
    setError(null);

    const cached = getPdfPages(filePath);

    if (cached && cached.length > 0) {
      setPages(cached);
      setLoading(false);
      return;
    }

    // Clear old pages immediately and show loading
    setPages([]);
    setLoading(true);

    let cancelled = false;

    async function loadPages() {
      try {
        const manifest = getPdfManifest();
        const manifestEntry = manifest?.[filePath];

        // If we have pre-rendered images in the manifest, use those
        if (manifestEntry && manifestEntry.pages > 0) {
          const imageUrls = await loadPagesFromImages(
            filePath,
            manifestEntry.pages
          );

          if (cancelled) return;

          // Set URLs directly - browser will load them
          setPages(imageUrls);
          setPdfPages(filePath, imageUrls);
          setLoading(false);
          return;
        }

        // Fallback to client-side PDF rendering
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

          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
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

    loadPages();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, filePath]);

  // Prefetch next PDFs - use file keys as dependency to avoid array reference issues
  const nextFileKeys = nextFiles.map((f) => f.key).join(",");
  useEffect(() => {
    if (loading || !nextFileKeys) return;

    const keys = nextFileKeys.split(",").filter(Boolean);
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    // Prefetch next 5 files with staggered delays
    keys.forEach((key, index) => {
      const timeoutId = setTimeout(() => {
        prefetchPdf(key);
      }, index * 100);
      timeoutIds.push(timeoutId);
    });

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [loading, nextFileKeys]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="bg-background/95 absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative flex h-full w-full flex-col">
        {/* Header */}
        <header className="border-border bg-card/80 z-10 shrink-0 border-b backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <button
                onClick={onClose}
                className="bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0 rounded-xl p-2"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <h1 className="text-foreground truncate font-mono text-base font-semibold sm:text-lg">
                {fileId}
              </h1>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <SharePopover filePath={filePath} queryString={queryString} />
              <a
                href={fileUrl}
                download
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 flex items-center gap-2 rounded-xl p-2 text-sm font-medium shadow-lg sm:px-4 sm:py-2"
              >
                <svg
                  className="h-4 w-4"
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
            </div>
          </div>
        </header>

        {/* Content - key forces remount on file change for clean transition */}
        <div
          key={filePath}
          className="flex-1 overflow-auto p-4 pb-24 sm:p-6 lg:p-8"
          onClick={onClose}
        >
          {error && (
            <div className="bg-destructive/10 border-destructive/20 text-destructive mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-2xl border px-5 py-4">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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
                <p className="text-destructive/80 mt-0.5 text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-4xl space-y-6">
            {pages.map((dataUrl, index) => {
              const pageCelebrities = getCelebritiesForPage(
                filePath,
                index + 1
              );
              return (
                <div
                  key={`${filePath}-${index}`}
                  className="bg-card border-border overflow-hidden rounded-2xl border shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative">
                    {pages.length > 1 && (
                      <div className="bg-background/80 text-muted-foreground border-border absolute top-3 left-3 rounded-lg border px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                        Page {index + 1}
                      </div>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt={`Page ${index + 1}`}
                      className="h-auto w-full md:mx-auto md:max-h-[75vh] md:w-auto"
                      style={{ maxWidth: "100%" }}
                    />
                  </div>
                  {pageCelebrities.length > 0 && (
                    <div className="bg-secondary/50 border-border border-t px-5 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="bg-primary/10 flex h-6 w-6 items-center justify-center rounded-full">
                          <svg
                            className="text-primary h-3.5 w-3.5"
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
                        <p className="text-foreground text-sm font-medium">
                          Detected in this image:
                        </p>
                      </div>
                      <div className="mb-4 flex flex-wrap gap-2">
                        {pageCelebrities.map((celeb, idx) => (
                          <span
                            key={idx}
                            className="bg-card border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                          >
                            <span>{celeb.name}</span>
                            <span className="text-muted-foreground text-xs">
                              ({Math.round(celeb.confidence)}
                              %)
                            </span>
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
            <div className="flex flex-col items-center justify-center gap-5 py-16">
              <div className="relative">
                <div className="border-secondary h-12 w-12 rounded-full border-2"></div>
                <div className="border-primary absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"></div>
              </div>
              <p className="text-foreground font-medium">Loading PDF...</p>
            </div>
          )}
        </div>

        {/* Navigation bar */}
        <div className="bg-card/90 border-border fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-2 py-2 shadow-lg backdrop-blur-sm">
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
            >
              <kbd className="bg-secondary text-foreground rounded-md px-2 py-0.5 font-mono text-xs">
                ←
              </kbd>
              <span>Prev</span>
            </button>
          ) : (
            <div className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-1.5 px-3 py-1.5 text-sm">
              <kbd className="bg-secondary/50 text-muted-foreground/50 rounded-md px-2 py-0.5 font-mono text-xs">
                ←
              </kbd>
              <span>Prev</span>
            </div>
          )}
          <div className="bg-border h-4 w-px"></div>
          {hasNext ? (
            <button
              onClick={onNext}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
            >
              <span>Next</span>
              <kbd className="bg-secondary text-foreground rounded-md px-2 py-0.5 font-mono text-xs">
                →
              </kbd>
            </button>
          ) : (
            <div className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-1.5 px-3 py-1.5 text-sm">
              <span>Next</span>
              <kbd className="bg-secondary/50 text-muted-foreground/50 rounded-md px-2 py-0.5 font-mono text-xs">
                →
              </kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
