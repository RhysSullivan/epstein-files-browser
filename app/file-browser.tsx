"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueryState } from "nuqs";
import { FileItem, getPdfPages, setPdfPages, getPdfManifest } from "@/lib/cache";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
  CELEBRITY_DATA,
} from "@/lib/celebrity-data";
import { CelebrityCombobox } from "@/components/celebrity-combobox";
import { CollectionCombobox } from "@/components/collection-combobox";
import { SortCombobox } from "@/components/sort-combobox";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";
import { useFiles } from "@/lib/files-context";
import ThemeToggle from "@/components/theme-toggle";
import GlobalSearch, { GlobalSearchHandle } from "@/components/global-search";
import { StatisticsDashboard } from "@/components/statistics-dashboard";
import { HelpCircle, BarChart3 } from "lucide-react";
import { fuzzyMatch } from "@/lib/fuzzy-search";

const WORKER_URL = "https://epstein-files.rhys-669.workers.dev";

// Client-only number formatter to avoid hydration mismatch
function FormattedNumber({ value }: { value: number }) {
  const [formatted, setFormatted] = useState(value.toString());
  
  useEffect(() => {
    setFormatted(value.toLocaleString());
  }, [value]);
  
  return <>{formatted}</>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

// Thumbnail component - loads thumbnail from R2
function Thumbnail({ fileKey }: { fileKey: string }) {
  const thumbnailUrl = `${WORKER_URL}/thumbnails/${fileKey.replace(".pdf", ".jpg")}`;

  return (
    <div className="relative w-full aspect-[3/4] bg-secondary rounded-xl overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt="Document thumbnail"
        className="absolute inset-0 w-full h-full object-cover object-top"
        loading="lazy"
      />
    </div>
  );
}

// File card component
function FileCard({ file, onClick, onMouseEnter }: { file: FileItem; onClick: () => void; onMouseEnter?: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group relative hover:-translate-y-1 text-left w-full transition-all duration-200 cursor-pointer"
    >
      <div className="relative mb-2 overflow-hidden rounded-xl">
        <Thumbnail fileKey={file.key} />
        {/* Hover overlay with metadata */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
          <p className="text-xs text-white/90 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {formatFileSize(file.size)}
          </p>
        </div>
        {/* Hover indicator */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <h3
          className="font-mono text-sm font-medium text-foreground truncate group-hover:text-primary"
          title={getFileId(file.key)}
        >
          {getFileId(file.key)}
        </h3>
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

// Track in-progress prefetch operations to avoid duplicates
const prefetchingSet = new Set<string>();

// Get the image URL for a specific PDF page
function getPageImageUrl(pdfKey: string, pageNum: number): string {
  const basePath = pdfKey.replace(".pdf", "");
  const pageStr = String(pageNum).padStart(3, "0");
  return `${WORKER_URL}/pdfs-as-jpegs/${basePath}/page-${pageStr}.jpg`;
}

// Load pages from pre-rendered images
async function loadPagesFromImages(filePath: string, pageCount: number): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    urls.push(getPageImageUrl(filePath, i));
  }
  return urls;
}

// Prefetch PDF pages in the background (uses pre-rendered images if available)
async function prefetchPdf(filePath: string): Promise<void> {
  if (getPdfPages(filePath) || prefetchingSet.has(filePath)) return;
  
  prefetchingSet.add(filePath);
  
  try {
    const manifest = getPdfManifest();
    const manifestEntry = manifest?.[filePath];
    
    // If we have pre-rendered images in the manifest, use those
    if (manifestEntry && manifestEntry.pages > 0) {
      const imageUrls = await loadPagesFromImages(filePath, manifestEntry.pages);
      
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

// Share popover component
function SharePopover({ filePath, queryString }: { filePath: string; queryString: string }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/file/${encodeURIComponent(filePath)}${queryString}`
    : `/file/${encodeURIComponent(filePath)}${queryString}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 sm:px-4 sm:py-2 bg-secondary hover:bg-accent rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="hidden sm:inline">Share</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="text-sm font-medium">Share this document</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-3 py-2 text-xs bg-secondary border border-border rounded-lg text-foreground truncate"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer",
                copied 
                  ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
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
  nextFiles
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(false);
  const [miniMapJump, setMiniMapJump] = useState(1);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [miniPages, setMiniPages] = useState<string[]>([]);

  // Persist mini-map collapsed/expanded state across sessions
  useEffect(() => {
    try {
      const raw = localStorage.getItem("minimap_collapsed");
      if (raw !== null) {
        setMiniMapCollapsed(raw === "true");
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("minimap_collapsed", miniMapCollapsed ? "true" : "false");
    } catch {}
  }, [miniMapCollapsed]);
  
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

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const swipeThreshold = 50;
    
    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
      if (deltaX > 0 && hasPrev) {
        onPrev();
      } else if (deltaX < 0 && hasNext) {
        onNext();
      }
    }
    
    touchStartRef.current = null;
  }, [hasPrev, hasNext, onPrev, onNext]);

  // Scroll to a specific page inside the modal content
  const scrollToPage = useCallback((pageIndex: number) => {
    const container = contentRef.current;
    const target = pageRefs.current[pageIndex];
    if (!container || !target) return;

    const top = target.offsetTop - 96; // larger offset to account for header and spacing
    container.scrollTo({ top, behavior: "smooth" });
  }, []);

  // Reset scroll/jump state when file changes
  useEffect(() => {
    pageRefs.current = [];
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0 });
    }
    setMiniMapJump(1);
  }, [filePath]);

  // Generate small thumbnails for mini-map to ensure proper previews
  useEffect(() => {
    let cancelled = false;
    async function buildThumbs() {
      if (pages.length === 0) {
        setThumbnails([]);
        return;
      }
      const targetW = 120;
      const targetH = 160; // 3/4 aspect ratio
      const results: string[] = new Array(pages.length);

      for (let i = 0; i < pages.length; i++) {
        const src = pages[i];
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.crossOrigin = "anonymous"; // allow drawing if same-origin
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = src;
          });
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-secondary").trim() || "#111";
          ctx.fillRect(0, 0, targetW, targetH);
          const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
          const drawW = Math.max(1, Math.floor(img.naturalWidth * scale));
          const drawH = Math.max(1, Math.floor(img.naturalHeight * scale));
          const dx = Math.floor((targetW - drawW) / 2);
          const dy = Math.floor((targetH - drawH) / 2);
          ctx.drawImage(img, dx, dy, drawW, drawH);
          results[i] = canvas.toDataURL("image/jpeg", 0.7);
        } catch {
          // Fallback to original src if thumbnail generation fails
          results[i] = src;
        }
        // Progressive update for responsiveness
        setThumbnails((prev) => {
          const next = prev.slice();
          next[i] = results[i];
          return next.length === pages.length ? next : [...results];
        });
      }
      if (!cancelled) {
        setThumbnails(results);
      }
    }
    buildThumbs();
    return () => { cancelled = true; };
  }, [pages, filePath]);

  // Build mini-map pages using pre-rendered images from manifest when available
  // Initialize with expected count immediately to prevent layout shifts
  const [expectedPageCount, setExpectedPageCount] = useState(0);
  
  useEffect(() => {
    const manifest = getPdfManifest();
    const manifestEntry = manifest?.[filePath];
    if (manifestEntry && manifestEntry.pages > 0) {
      setExpectedPageCount(manifestEntry.pages);
      const urls: string[] = [];
      for (let i = 1; i <= manifestEntry.pages; i++) {
        urls.push(getPageImageUrl(filePath, i));
      }
      setMiniPages(urls);
    } else {
      // Fallback: use pages count when available
      if (pages.length > 0) {
        setExpectedPageCount(pages.length);
        setMiniPages(pages);
      }
    }
  }, [filePath, pages]);

  // Track current page index based on scroll position to highlight in mini-map
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handler = () => {
      const scrollTop = container.scrollTop;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const dist = Math.abs(el.offsetTop - scrollTop);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      setCurrentPageIndex(bestIdx);
    };

    container.addEventListener("scroll", handler, { passive: true });
    // Initialize once
    handler();
    return () => container.removeEventListener("scroll", handler as EventListener);
  }, [pages.length]);

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
        console.log('[FileModal] Loading PDF:', filePath);
        const manifest = getPdfManifest();
        const manifestEntry = manifest?.[filePath];
        
        // If we have pre-rendered images in the manifest, use those
        if (manifestEntry && manifestEntry.pages > 0) {
          console.log('[FileModal] Using pre-rendered images, pages:', manifestEntry.pages);
          const imageUrls = await loadPagesFromImages(filePath, manifestEntry.pages);
          
          if (cancelled) return;
          
          // Set URLs directly - browser will load them
          setPages(imageUrls);
          setPdfPages(filePath, imageUrls);
          setLoading(false);
          console.log('[FileModal] Pre-rendered images loaded successfully');
          return;
        }
        
        console.log('[FileModal] No pre-rendered images, using client-side PDF rendering');
        // Fallback to client-side PDF rendering
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        console.log('[FileModal] PDF loaded, pages:', pdf.numPages);

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
          console.error('[FileModal] Error loading PDF:', err);
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
  const nextFileKeys = nextFiles.map(f => f.key).join(',');
  useEffect(() => {
    if (loading || !nextFileKeys) return;
    
    const keys = nextFileKeys.split(',').filter(Boolean);
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

  const contentClasses = cn(
    "flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-48 xl:pl-56"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div className="relative w-full h-full flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-xl z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h1 className="text-base sm:text-lg font-mono font-semibold text-foreground truncate">{fileId}</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <SharePopover filePath={filePath} queryString={queryString} />
              <a
                href={fileUrl}
                download
                className="p-2 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Download</span>
              </a>
            </div>
          </div>
        </header>

        {/* Content - key forces remount on file change for clean transition */}
        {/* Add extra bottom padding so the bottom nav doesn't overlap the detected metadata */}
        <div
          key={filePath}
          ref={contentRef}
          className={contentClasses}
          onClick={onClose}
        >
          {error && (
            <div className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-2xl mb-6 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Error loading PDF</p>
                <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-6">
            {pages.map((dataUrl, index) => {
              const pageCelebrities = getCelebritiesForPage(filePath, index + 1);
              return (
                <div
                  key={`${filePath}-${index}`}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border"
                  onClick={(e) => e.stopPropagation()}
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
                      alt={`Page ${index + 1}`}
                      className="max-w-full h-auto max-h-[75vh] mx-auto block"
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
                        <p className="text-sm font-medium text-foreground">Detected in this image:</p>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {pageCelebrities.map((celeb, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-card border border-border text-foreground"
                          >
                            <span>{celeb.name}</span>
                            <span className="text-xs text-muted-foreground">({Math.round(celeb.confidence)}%)</span>
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

          {/* Spacer to ensure content can scroll past the fixed bottom nav */}
          <div className="h-16" aria-hidden="true" />
        </div>

        {/* Mini-map for quick page jumps (desktop only, left sidebar) */}
        {showMiniMap && (expectedPageCount > 0 || pages.length > 0) && !miniMapCollapsed && (
          <div 
            className="hidden xl:flex fixed left-6 top-28 z-30 w-40 flex-col overflow-hidden rounded-2xl border border-border bg-card/90 backdrop-blur-sm shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'expandMinimap 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              transformOrigin: 'top left',
              height: 'calc(100vh - 14rem)'
            }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-b from-card to-card/95 backdrop-blur-md border-b border-border/50 shadow-sm">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground tracking-wide">Navigation</span>
                  </div>
                  <button
                    onClick={() => setMiniMapCollapsed(true)}
                    className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 transition-colors cursor-pointer group"
                    aria-label="Collapse mini-map"
                  >
                    <svg className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
                
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min={1}
                      max={expectedPageCount || pages.length}
                      value={miniMapJump}
                      onChange={(e) => {
                        const val = Math.min(Math.max(1, Number(e.target.value) || 1), expectedPageCount || pages.length);
                        setMiniMapJump(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          scrollToPage(miniMapJump - 1);
                        }
                      }}
                      placeholder="Page"
                      className="w-full px-2.5 py-1.5 text-xs bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>
                  <button
                    onClick={() => scrollToPage(miniMapJump - 1)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/90 text-primary-foreground hover:bg-primary shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-1"
                    aria-label="Go to page"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
                
                <div className="text-[10px] text-muted-foreground">
                  <span>{expectedPageCount || pages.length} pages</span>
                </div>
              </div>
            </div>
            
            {/* Thumbnails */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgb(var(--border)) transparent'
              }}
            >
              {Array.from({ length: expectedPageCount || pages.length }).map((_, idx) => {
              const src = miniPages[idx] || pages[idx];
              const isLoaded = !!src;
              
              return (
                <button
                  key={`mini-${filePath}-${idx}`}
                  onClick={() => {
                    if (isLoaded) scrollToPage(idx);
                  }}
                  className={cn(
                    "w-full rounded-lg border overflow-hidden transition-all flex-shrink-0",
                    isLoaded ? "bg-secondary/50 hover:border-primary hover:shadow-sm cursor-pointer" : "bg-secondary/30 cursor-wait",
                    currentPageIndex === idx && isLoaded ? "ring-2 ring-primary border-primary" : "border-border"
                  )}
                  aria-label={`Jump to page ${idx + 1}`}
                  disabled={!isLoaded}
                >
                  <div className="relative aspect-[3/4] w-full bg-secondary rounded-md overflow-hidden">
                    {isLoaded ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          crossOrigin="anonymous"
                          alt={`Page ${idx + 1} thumbnail`}
                          className="absolute inset-0 w-full h-full object-contain"
                          loading="lazy"
                        />
                        <div className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-background/80 border border-border text-foreground/80">
                          {idx + 1}
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60 animate-spin" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            </div>
          </div>
        )}
        {showMiniMap && (expectedPageCount > 0 || pages.length > 0) && miniMapCollapsed && (
          <div 
            className="hidden xl:flex fixed left-6 top-28 z-30" 
            style={{
              animation: 'collapseMinimap 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setMiniMapCollapsed(false); }}
              className="px-3 py-1.5 rounded-full border border-border bg-card/90 backdrop-blur-sm text-xs text-muted-foreground hover:bg-secondary cursor-pointer shadow transition-all hover:scale-105 flex items-center gap-1.5"
              aria-label="Expand mini-map"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Show mini-map
            </button>
          </div>
        )}

        {/* Navigation bar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-2 bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-lg z-20">
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">←</kbd>
              <span>Prev</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed">
              <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md font-mono text-xs text-muted-foreground/50">←</kbd>
              <span>Prev</span>
            </div>
          )}
          <div className="w-px h-4 bg-border"></div>
          {hasNext ? (
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full cursor-pointer"
            >
              <span>Next</span>
              <kbd className="px-2 py-0.5 bg-secondary rounded-md font-mono text-xs text-foreground">→</kbd>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed">
              <span>Next</span>
              <kbd className="px-2 py-0.5 bg-secondary/50 rounded-md font-mono text-xs text-muted-foreground/50">→</kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileBrowser() {
  const { files: initialFiles } = useFiles();
  
  // Debug: Log files on mount
  useEffect(() => {
    console.log('[FileBrowser] Files loaded:', initialFiles.length);
    if (initialFiles.length > 0) {
      console.log('[FileBrowser] First file:', initialFiles[0]);
    }
  }, [initialFiles]);

  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });
  const [celebrityFilter, setCelebrityFilter] = useQueryState("celebrity", {
    defaultValue: "All",
  });
  const [sortBy, setSortBy] = useQueryState("sort", {
    defaultValue: "name",
  });
  const [openFile, setOpenFile] = useQueryState("file");
  const [searchQuery, setSearchQuery] = useQueryState("q", { defaultValue: "" });
  const hasActiveFilters = (collectionFilter !== "All") || (celebrityFilter !== "All") || !!(searchQuery && searchQuery.trim());
  const searchRef = useRef<GlobalSearchHandle | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const resetFilters = useCallback(() => {
    setCollectionFilter("All");
    setCelebrityFilter("All");
    setSearchQuery(null);
  }, [setCollectionFilter, setCelebrityFilter, setSearchQuery]);

  // Recent searches for inline history display
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("recent_searches");
      const list: string[] = raw ? JSON.parse(raw) : [];
      setRecentSearches(list);
    } catch {
      setRecentSearches([]);
    }
  }, [searchQuery]);

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99);

  // Calculate celebrity counts based on current collection filter
  const celebrityCounts = useMemo(() => {
    let baseFiles = initialFiles;
    
    // Apply collection filter to base files
    if (collectionFilter !== "All") {
      baseFiles = baseFiles.filter((f) => f.key.startsWith(collectionFilter));
    }
    
    // Count how many files each celebrity appears in (within the filtered collection)
    const counts: { [name: string]: number } = {};
    for (const celeb of celebrities) {
      const celebFiles = new Set(getFilesForCelebrity(celeb.name, 99));
      counts[celeb.name] = baseFiles.filter(f => celebFiles.has(f.key)).length;
    }
    
    return counts;
  }, [initialFiles, collectionFilter, celebrities]);

  // Derive filtered and sorted files from initialFiles + filters + search
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

    // Apply search query with fuzzy matching
    const q = (searchQuery || "").trim();
    if (q) {
      // Precompute keys for celebrities matching the query using fuzzy search
      const matchedCelebKeys = new Set<string>();
      for (const c of celebrities) {
        const celebMatch = fuzzyMatch(q, c.name);
        if (celebMatch.matches) {
          for (const fk of getFilesForCelebrity(c.name, 99)) matchedCelebKeys.add(fk);
        }
      }

      // Score and filter files using fuzzy matching
      const scoredFiles = files.map((f) => {
        const id = getFileId(f.key);
        const prefix = f.key.split("/")[0] || "";
        
        // Calculate fuzzy match scores for different fields
        const idMatch = fuzzyMatch(q, id);
        const keyMatch = fuzzyMatch(q, f.key);
        const volumeMatch = fuzzyMatch(q, prefix);
        const celebMatch = matchedCelebKeys.has(f.key);
        
        // Best score wins
        let bestScore = 0;
        if (idMatch.matches) bestScore = Math.max(bestScore, idMatch.score);
        if (keyMatch.matches) bestScore = Math.max(bestScore, keyMatch.score);
        if (volumeMatch.matches) bestScore = Math.max(bestScore, volumeMatch.score);
        if (celebMatch) bestScore = Math.max(bestScore, 500); // Celebrity match gets medium-high score
        
        return { file: f, score: bestScore };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);
      
      files = scoredFiles.map((r) => r.file);
    }

    // Apply sorting
    files = [...files].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime();
        case "date-asc":
          return new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime();
        case "size-desc":
          return b.size - a.size;
        case "size-asc":
          return a.size - b.size;
        case "name":
        default:
          return getFileId(a.key).localeCompare(getFileId(b.key));
      }
    });

    return files;
  }, [initialFiles, collectionFilter, celebrityFilter, sortBy, searchQuery, celebrities]);

  // Build query string to preserve filters in file links
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (collectionFilter !== "All") params.set("collection", collectionFilter);
    if (celebrityFilter !== "All") params.set("celebrity", celebrityFilter);
    if (searchQuery) params.set("q", searchQuery);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [collectionFilter, celebrityFilter, searchQuery]);
  
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

  // Incremental rendering: reveal files progressively as user scrolls
  const INITIAL_BATCH = 60;
  const LOAD_STEP = 60;
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_BATCH);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);

  // Reset visible count when filters or sorting change
  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
  }, [collectionFilter, celebrityFilter, sortBy, searchQuery]);

  // IntersectionObserver to load more when sentinel enters viewport
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const onIntersect: IntersectionObserverCallback = (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && visibleCount < filteredFiles.length) {
        setIsAutoLoading(true);
        // Batch more items
        setVisibleCount((c) => Math.min(c + LOAD_STEP, filteredFiles.length));
      }
    };
    const io = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: "600px 0px 600px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filteredFiles.length, visibleCount]);

  useEffect(() => {
    // Stop the loading indicator when we've revealed more items
    setIsAutoLoading(false);
  }, [visibleCount]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // Always allow opening the help with Shift+?
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      if (isTyping) return;
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      if (!hasModifier && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (!hasModifier && e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetFilters();
      } else if (e.key === "Escape" && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetFilters, showShortcuts]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center min-w-0">
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold text-foreground tracking-tight truncate">
                  Epstein Files Browser
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative group">
                <ThemeToggle variant="header" />
                <span className="pointer-events-none absolute top-full right-0 mt-2 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm group-hover:block">
                  Theme wechseln
                </span>
              </div>
              <div className="relative group">
                <button
                  onClick={() => setShowStats(true)}
                  className="p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 cursor-pointer"
                  aria-label="Statistiken"
                  title="Statistiken"
                >
                  <BarChart3 className="w-5 h-5" />
                </button>
                <span className="pointer-events-none absolute top-full right-0 mt-2 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm group-hover:block">
                  Statistiken
                </span>
              </div>
              <div className="relative group">
                <button
                  onClick={() => setShowShortcuts(true)}
                  className="p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 cursor-pointer"
                  aria-label="Keyboard shortcuts"
                  title="Keyboard shortcuts (?)"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
                <span className="pointer-events-none absolute top-full right-0 mt-2 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm group-hover:block">
                  Tastenkürzel
                </span>
              </div>
              <div className="relative inline-flex group">
                <a
                  href="https://github.com/RhysSullivan/epstein-files-browser"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105"
                  aria-label="View source on GitHub"
                  title="View source on GitHub"
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
                <span className="pointer-events-none absolute top-full right-0 mt-2 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm group-hover:block">
                  GitHub öffnen
                </span>
              </div>
            </div>
          </div>

          {/* Filters row inside sticky header */}
          <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-3">
            {/* Search on its own row above filters */}
            <div className="w-full">
              <GlobalSearch ref={searchRef} />
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <div className="col-span-1">
                <CollectionCombobox
                  value={collectionFilter}
                  onValueChange={(value) => setCollectionFilter(value)}
                />
              </div>
              <div className="col-span-1">
                <CelebrityCombobox
                  celebrities={celebrities.map(c => ({ ...c, count: celebrityCounts[c.name] || 0 }))}
                  value={celebrityFilter}
                  onValueChange={(value) => setCelebrityFilter(value)}
                />
              </div>
              <div className="col-span-1">
                <SortCombobox
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value)}
                />
              </div>
              {/* Separate Reset button tile - next to Sort on mobile */}
              <div className="col-span-1 sm:col-span-1 sm:w-auto">
                <button
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground hover:bg-accent hover:text-foreground transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  aria-disabled={!hasActiveFilters}
                  aria-label="Reset filters"
                  title="Reset filters"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Reset Filters</span>
                </button>
              </div>

              {/* File count tile - full width on mobile, after controls */}
              <div className="col-span-2 sm:col-span-1 sm:w-auto">
                <div className="flex items-center justify-center sm:justify-start gap-2 px-3 py-2 bg-secondary/50 rounded-xl w-full">
                  <span className="text-sm font-medium text-muted-foreground">
                    <FormattedNumber value={filteredFiles.length} /> files
                    {collectionFilter !== "All" || celebrityFilter !== "All" || (searchQuery && searchQuery.trim())
                      ? <span className="text-foreground/50"> / <FormattedNumber value={initialFiles.length} /></span>
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Shortcuts Popup */}
      {showShortcuts && (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4 sm:px-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Keyboard shortcuts</h2>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                aria-label="Close shortcuts"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              {[{label:"Focus search", combo:["/"]},{label:"Reset filters", combo:["R"]},{label:"Open shortcuts", combo:["Shift","?"]},{label:"Close (Esc)", combo:["Esc"]}].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <div className="flex items-center gap-1">
                    {item.combo.map((key) => (
                      <kbd key={key} className="px-2 py-1 rounded-md bg-secondary border border-border text-xs font-mono text-foreground">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== "All" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-5 py-4 rounded-2xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <CelebrityDisclaimer className="text-amber-200/90 [&_a]:text-amber-300 [&_a]:hover:text-amber-100" />
                <p className="text-sm mt-1.5 text-amber-200/70">
                  Results limited to {">"}99% confidence matches from AWS Rekognition.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Grid */
      }
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFiles.slice(0, visibleCount).map((file) => (
            <FileCard 
              key={file.key} 
              file={file} 
              onClick={() => setOpenFile(file.key)} 
              onMouseEnter={() => prefetchPdf(file.key)}
            />
          ))}
        </div>

        {/* Load more sentinel + status */}
        {filteredFiles.length > visibleCount && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {isAutoLoading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"></path>
                </svg>
              )}
              <span>
                Showing {visibleCount.toLocaleString()} of {filteredFiles.length.toLocaleString()} files
              </span>
            </div>
          </div>
        )}

        {/* Intersection sentinel */}
        <div ref={loadMoreRef} className="h-1 w-full" />

        {/* Empty state */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No files found</h3>
            <p className="text-muted-foreground text-sm mb-4">Try changing your search or adjusting filters.</p>
            {recentSearches.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {recentSearches.map((s) => (
                  <button
                    key={`empty-${s}`}
                    onClick={() => setSearchQuery(s)}
                    className="px-2.5 py-1 rounded-full bg-secondary hover:bg-accent text-xs text-foreground border border-border cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
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
          nextFiles={selectedFileIndex !== null ? filteredFiles.slice(selectedFileIndex + 1, selectedFileIndex + 6) : []}
        />
      )}

      {/* Statistics Modal */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowStats(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-4 sm:p-6 flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Statistiken
              </h2>
              <button
                onClick={() => setShowStats(false)}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Close statistics"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <StatisticsDashboard 
                files={filteredFiles} 
                allFiles={initialFiles}
                hasActiveFilter={hasActiveFilters}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
