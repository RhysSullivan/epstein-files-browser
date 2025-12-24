import { getPdfPages, setPdfPages, getPdfManifest } from "./cache";
import { WORKER_URL } from "./const";

// Track in-progress prefetch operations to avoid duplicates
const prefetchingSet = new Set<string>();

// Get the image URL for a specific PDF page
function getPageImageUrl(pdfKey: string, pageNum: number) {
  const basePath = pdfKey.replace(".pdf", "");
  const pageStr = String(pageNum).padStart(3, "0");
  return `${WORKER_URL}/pdfs-as-jpegs/${basePath}/page-${pageStr}.jpg`;
}

// Load pages from pre-rendered images
export async function loadPagesFromImages(filePath: string, pageCount: number) {
  const urls: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    urls.push(getPageImageUrl(filePath, i));
  }
  return urls;
}

// Prefetch PDF pages in the background (uses pre-rendered images if available)
export async function prefetchPdf(filePath: string) {
  if (getPdfPages(filePath) || prefetchingSet.has(filePath)) return;

  prefetchingSet.add(filePath);

  try {
    const manifest = getPdfManifest();
    const manifestEntry = manifest?.[filePath];

    // If we have pre-rendered images in the manifest, use those
    if (manifestEntry && manifestEntry.pages > 0) {
      const imageUrls = await loadPagesFromImages(
        filePath,
        manifestEntry.pages
      );

      // Prefetch the images by creating Image objects
      await Promise.all(
        imageUrls.map((url) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Still resolve on error
            img.src = url;
          });
        })
      );

      setPdfPages(filePath, imageUrls);
      return;
    }

    // Fallback to client-side PDF rendering if no pre-rendered images
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

      renderedPages.push(canvas.toDataURL("image/jpeg", 0.85));
    }

    if (renderedPages.length > 0) {
      setPdfPages(filePath, renderedPages);
    }
  } catch {
    // Silently fail prefetch
  } finally {
    prefetchingSet.delete(filePath);
  }
}
