"use client";

import { getThumbnailUrl } from "@/lib/pdf-utils";
import { getFileId, formatFileSize } from "@/lib/constants";
import { type FileItem } from "@/lib/cache";

interface ThumbnailProps {
  fileKey: string;
}

export function Thumbnail({ fileKey }: ThumbnailProps) {
  const thumbnailUrl = getThumbnailUrl(fileKey);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrl}
      alt={`Thumbnail for ${getFileId(fileKey)}`}
      className="aspect-[3/4] w-full object-cover object-top bg-secondary rounded-xl"
      loading="lazy"
    />
  );
}

interface FileCardProps {
  file: FileItem;
  onClick: () => void;
}

export function FileCard({ file, onClick }: FileCardProps) {
  const fileId = getFileId(file.key);

  return (
    <button
      onClick={onClick}
      className="group relative bg-card border border-border rounded-2xl p-3 hover:border-primary/50 hover:bg-accent/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 text-left w-full transition-all duration-200"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 280px" }}
      aria-label={`View document ${fileId}`}
    >
      <div className="mb-3 overflow-hidden rounded-xl group-hover:ring-2 group-hover:ring-primary/20 transition-all duration-200">
        <Thumbnail fileKey={file.key} />
      </div>

      <div className="space-y-1.5">
        <h3
          className="font-mono text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors"
          title={fileId}
        >
          {fileId}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>
      </div>

      {/* Hover indicator */}
      <div
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden="true"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-primary"
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
        </div>
      </div>
    </button>
  );
}
