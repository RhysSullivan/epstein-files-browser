"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPdfPages, setPdfPages } from "@/lib/cache";

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

function getAdjacentFileId(currentId: string, offset: number): string | null {
  const match = currentId.match(/EFTA(\d+)/);
  if (!match) return null;

  const num = parseInt(match[1], 10) + offset;
  if (num < 1) return null;

  return `EFTA${num.toString().padStart(8, "0")}`;
}

function getFilePath(fileId: string): string {
  const match = fileId.match(/EFTA(\d+)/);
  if (!match) return fileId;

  let num = parseInt(match[1], 10);

  let vol: string;
  if (num <= 3158) {
    vol = "VOL00001";
  } else if (num <= 3857) {
    vol = "VOL00002";
    num -= 3158; 
  } else if (num <= 5704) {
    vol = "VOL00003";
    num -= 3857
  } else {
    vol = "VOL00004";
    num -= 5704;
  }

  const subfolder = Math.ceil(num / 1000)
    .toString()
    .padStart(4, "0");

  return `${vol}/IMAGES/${subfolder}/${fileId}.pdf`;
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
  const prevId = getAdjacentFileId(fileId, -1);
  const nextId = getAdjacentFileId(fileId, 1);

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

      if (e.key === "ArrowLeft" && prevId) {
        router.push(`/file/${encodeURIComponent(getFilePath(prevId))}`);
      } else if (e.key === "ArrowRight" && nextId) {
        router.push(`/file/${encodeURIComponent(getFilePath(nextId))}`);
      }
    },
    [prevId, nextId, router]
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
      if (nextId) {
        const nextPath = getFilePath(nextId);
        prefetchPdf(nextPath);
      }

      // Then prefetch previous
      if (prevId) {
        const prevPath = getFilePath(prevId);
        // Slight delay so next gets priority
        timeoutIds.push(setTimeout(() => prefetchPdf(prevPath), 500));
      }
    }, 100);

    timeoutIds.push(prefetchTimeout);

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [loading, nextId, prevId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link
              href="/"
              className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6"
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
            <h1 className="text-sm sm:text-lg font-mono text-white truncate">{fileId}</h1>
            {totalPages > 0 && (
              <span className="text-xs sm:text-sm text-zinc-500 hidden sm:inline flex-shrink-0">
                {pages.length} / {totalPages} pages
              </span>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {prevId && (
              <Link
                href={`/file/${encodeURIComponent(getFilePath(prevId))}`}
                className="p-1.5 sm:px-3 sm:py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                aria-label="Previous file"
              >
                <svg
                  className="w-5 h-5 sm:hidden"
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
                <span className="hidden sm:inline">Previous</span>
              </Link>
            )}
            {nextId && (
              <Link
                href={`/file/${encodeURIComponent(getFilePath(nextId))}`}
                className="p-1.5 sm:px-3 sm:py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                aria-label="Next file"
              >
                <svg
                  className="w-5 h-5 sm:hidden"
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
                <span className="hidden sm:inline">Next</span>
              </Link>
            )}
            <a
              href={fileUrl}
              download
              className="p-1.5 sm:px-3 sm:py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
              aria-label="Download PDF"
            >
              <svg
                className="w-5 h-5 sm:hidden"
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
              <span className="hidden sm:inline">Download PDF</span>
            </a>
          </div>
        </div>
      </header>

      {/* PDF Pages */}
      <main ref={containerRef} className="flex-1 overflow-auto p-4">
        {error && (
          <div className="max-w-3xl mx-auto bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-4">
          {pages.map((dataUrl, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-lg overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt={`Page ${index + 1}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
              />
            </div>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-white"></div>
            <p className="text-zinc-500">
              {pages.length > 0
                ? `Rendering page ${pages.length + 1} of ${totalPages}...`
                : "Loading PDF..."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
