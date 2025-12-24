import { FileItem } from '@/lib/cache'
import { Thumbnail } from './thumbnail'
import { formatFileSize, getFileId } from '@/lib/utils'

export function FileCard({
  file,
  onClick,
  onMouseEnter,
}: {
  file: FileItem
  onClick: () => void
  onMouseEnter?: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group relative w-full cursor-pointer text-left transition-all duration-200 hover:-translate-y-1"
    >
      <div className="relative mb-2 overflow-hidden rounded-xl">
        <Thumbnail fileKey={file.key} />
        {/* Hover overlay with metadata */}
        <div className="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="flex items-center gap-1.5 text-xs text-white/90">
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {formatFileSize(file.size)}
          </p>
        </div>
        {/* Hover indicator */}
        <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <svg
              className="h-3.5 w-3.5 text-white"
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
      </div>

      <div className="space-y-1">
        <h3
          className="text-foreground group-hover:text-primary truncate font-mono text-sm font-medium"
          title={getFileId(file.key)}
        >
          {getFileId(file.key)}
        </h3>
      </div>
    </button>
  )
}
