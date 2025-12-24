import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { CELEBRITY_DATA } from "./celebrity-data"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/)
  return match ? match[0] : key
}

// Get celebrities for a specific file and page
export function getCelebritiesForPage(
  filePath: string,
  pageNumber: number
): { name: string; confidence: number }[] {
  const celebrities: { name: string; confidence: number }[] = []

  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      if (appearance.file === filePath && appearance.page === pageNumber) {
        celebrities.push({
          name: celebrity.name,
          confidence: appearance.confidence,
        })
      }
    }
  }

  return celebrities
    .sort((a, b) => b.confidence - a.confidence)
    .filter((celeb) => celeb.confidence > 99)
}
