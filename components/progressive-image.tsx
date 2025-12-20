"use client";

import { useState, useRef } from "react";

// Simple LRU-ish cache in localStorage for tiny previews
const CACHE_KEY = "img-previews";
const MAX_CACHED = 500;

function getCachedPreview(src: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return cache[src] || null;
  } catch {
    return null;
  }
}

function setCachedPreview(src: string, dataUrl: string) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const keys = Object.keys(cache);

    // Evict oldest entries if cache is full
    if (keys.length >= MAX_CACHED) {
      const toRemove = keys.slice(0, 100);
      toRemove.forEach(k => delete cache[k]);
    }

    cache[src] = dataUrl;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable - ignore
  }
}

function generateTinyPreview(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 8px wide for ~200 byte data URLs
    const width = 8;
    const height = Math.round((img.naturalHeight / img.naturalWidth) * width);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill";
  objectPosition?: string;
  loading?: "lazy" | "eager";
}

/**
 * Fast image loading with cached tiny previews.
 * First visit: skeleton → image
 * Repeat visits: tiny preview → image (instant perceived load)
 */
export function ProgressiveImage({
  src,
  alt,
  className = "",
  aspectRatio = "3/4",
  objectFit = "cover",
  objectPosition = "top",
  loading = "lazy",
}: ProgressiveImageProps) {
  // Initialize preview from cache synchronously
  const [preview] = useState(() => getCachedPreview(src));
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleLoad = () => {
    setLoaded(true);
    // Cache tiny preview for next visit
    const img = imgRef.current;
    if (img && !getCachedPreview(src)) {
      const tiny = generateTinyPreview(img);
      if (tiny) setCachedPreview(src, tiny);
    }
  };

  // Handle ref callback to check if image is already complete
  const setImgRef = (img: HTMLImageElement | null) => {
    imgRef.current = img;
    if (img?.complete && img.naturalWidth > 0 && !loaded) {
      handleLoad();
    }
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      {/* Skeleton - shown only if no preview and not loaded */}
      {!preview && !loaded && (
        <div className="absolute inset-0 bg-secondary">
          <div
            className="absolute inset-0 animate-shimmer"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, hsl(var(--muted-foreground) / 0.08) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      )}

      {/* Tiny cached preview - shown until full image loads */}
      {preview && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            objectPosition,
            filter: "blur(8px)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Full resolution image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={setImgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={handleLoad}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit,
          objectPosition,
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  );
}

/**
 * Simple image component for already-loaded data URLs.
 */
export function FadeInImage({
  src,
  alt,
  className = "",
  style = {},
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
    />
  );
}
