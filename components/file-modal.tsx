"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { type FileItem, getPdfPages, setPdfPages } from "@/lib/cache";
import { getFileId, WORKER_URL, PDF_RENDER_SCALE } from "@/lib/constants";
import { prefetchPdf, getFileUrl } from "@/lib/pdf-utils";
import { getCelebritiesForPage } from "@/lib/celebrity-utils";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";

interface FileModalProps {
  file: FileItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  queryString: string;
  nextFile: FileItem | null;
}

export function FileModal({
  file,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  queryString,
  nextFile,
}: FileModalProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const filePath = file.key;
  const fileId = getFileId(filePath);
  const fileUrl = getFileUrl(filePath);

  // Keyboard navigation with focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        onNext();
      } else if (e.key === "Tab") {
        // Focus trap
        const modal = modalRef.current;
        if (!modal) return;

        const focusableElements = modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    // Focus first focusable element
    const modal = modalRef.current;
    if (modal) {
      const firstFocusable = modal.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative w-full h-full flex flex-col">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-xl z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
                aria-label="Close modal"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <h1
                id="modal-title"
                className="text-base sm:text-lg font-mono font-semibold text-foreground truncate"
              >
                {fileId}
              </h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/file/${encodeURIComponent(filePath)}${queryString}`}
                className="p-2 sm:px-4 sm:py-2 bg-secondary hover:bg-accent rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
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
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                <span className="hidden sm:inline">Open</span>
              </Link>
              <a
                href={fileUrl}
                download
                className="p-2 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-primary/20 transition-colors"
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
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24">
          {error && (
            <div className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-2xl mb-6 flex items-start gap-3">
              <svg
                className="w-5 h-5 flex-shrink-0 mt-0.5"
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
                <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-6">
            {pages.map((dataUrl, index) => {
              const pageCelebrities = getCelebritiesForPage(
                filePath,
                index + 1
              );
              return (
                <div
                  key={index}
                  className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border"
                >
                  <div className="relative">
                    {pages.length > 1 && (
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-background/80 backdrop-blur-sm rounded-lg text-xs font-medium text-muted-foreground border border-border">
                        Page {index + 1}
                      </div>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt={`Page ${index + 1} of ${fileId}`}
                      className="w-full h-auto md:max-h-[75vh] md:w-auto md:mx-auto"
                      style={{ maxWidth: "100%" }}
                    />
                  </div>
                  {pageCelebrities.length > 0 && (
                    <div className="bg-secondary/50 border-t border-border px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
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
                        {pageCelebrities.map((celeb, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-card border border-border text-foreground"
                          >
                            <span>{celeb.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(celeb.confidence)}%)
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
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-secondary"></div>
                <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              </div>
              <p className="text-foreground font-medium">Loading PDF...</p>
            </div>
          )}
        </div>

        {/* Navigation bar */}
        <nav
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-2 bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-lg z-20"
          aria-label="File navigation"
        >
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
              aria-label="Previous file"
            >
              <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">
                ←
              </kbd>
              <span>Prev</span>
            </button>
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
          {hasNext ? (
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
              aria-label="Next file"
            >
              <span>Next</span>
              <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">
                →
              </kbd>
            </button>
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
    </div>
  );
}
