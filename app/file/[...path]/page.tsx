"use client";

import { use, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getPdfPages, setPdfPages } from "@/lib/cache";

const WORKER_URL = process.env.NODE_ENV === "development" 
  ? "http://localhost:8787" 
  : "https://epstein-files.rhys-669.workers.dev";

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

  const num = parseInt(match[1], 10);

  let vol: string;
  if (num <= 3158) {
    vol = "VOL00001";
  } else if (num <= 3857) {
    vol = "VOL00002";
  } else if (num <= 5704) {
    vol = "VOL00003";
  } else {
    vol = "VOL00004";
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

  const prevId = getAdjacentFileId(fileId, -1);
  const nextId = getAdjacentFileId(fileId, 1);

  const fileUrl = `${WORKER_URL}/${filePath}`;

  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check cache for pre-rendered pages
    const cachedPages = getPdfPages(filePath);
    
    // Already have cached pages
    if (cachedPages && cachedPages.length > 0) {
      setPages(cachedPages);
      setTotalPages(cachedPages.length);
      setLoading(false);
      return;
    }

    // Reset state for new file
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
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
            <h1 className="text-lg font-mono text-white">{fileId}</h1>
            {totalPages > 0 && (
              <span className="text-sm text-zinc-500">
                {pages.length} / {totalPages} pages
              </span>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {prevId && (
              <Link
                href={`/file/${encodeURIComponent(getFilePath(prevId))}`}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
              >
                Previous
              </Link>
            )}
            {nextId && (
              <Link
                href={`/file/${encodeURIComponent(getFilePath(nextId))}`}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
              >
                Next
              </Link>
            )}
            <a
              href={fileUrl}
              download
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
            >
              Download PDF
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
