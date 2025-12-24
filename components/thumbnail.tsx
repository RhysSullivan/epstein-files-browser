import { WORKER_URL } from '@/lib/const'

// Thumbnail component - loads thumbnail from R2
export function Thumbnail({ fileKey }: { fileKey: string }) {
  const thumbnailUrl = `${WORKER_URL}/thumbnails/${fileKey.replace(
    '.pdf',
    '.jpg'
  )}`

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrl}
      alt="Document thumbnail"
      className="bg-secondary aspect-3/4 w-full rounded-xl object-cover object-top"
      loading="lazy"
    />
  )
}
