import { getPdfPages, setPdfPages } from "./cache";
import { WORKER_URL, PDF_RENDER_SCALE } from "./constants";

// Track in-progress prefetch operations to avoid duplicates
const prefetchingSet = new Set<string>();

/**
 * Prefetch a PDF in the background and cache it
 * Returns a promise that resolves when prefetching is complete
 */
export async function prefetchPdf(filePath: string): Promise<void> {
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

/**
 * Load a PDF and return rendered pages as data URLs
 * Supports progressive loading with a callback for each page
 */
export async function loadPdf(
  filePath: string,
  onPageRendered?: (pages: string[], pageNum: number, totalPages: number) => void,
  signal?: AbortSignal
): Promise<string[]> {
  // Check cache first
  const cached = getPdfPages(filePath);
  if (cached && cached.length > 0) {
    return cached;
  }

  const fileUrl = `${WORKER_URL}/${filePath}`;
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const loadingTask = pdfjsLib.getDocument(fileUrl);
  const pdf = await loadingTask.promise;

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const renderedPages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

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

    if (onPageRendered) {
      onPageRendered([...renderedPages], pageNum, pdf.numPages);
    }
  }

  // Cache all pages when done
  if (renderedPages.length > 0) {
    setPdfPages(filePath, renderedPages);
  }

  return renderedPages;
}

/**
 * Get the URL for a file from the worker
 */
export function getFileUrl(filePath: string): string {
  return `${WORKER_URL}/${filePath}`;
}

/**
 * Get the thumbnail URL for a file
 */
export function getThumbnailUrl(fileKey: string): string {
  return `${WORKER_URL}/thumbnails/${fileKey.replace(".pdf", ".jpg")}`;
}
