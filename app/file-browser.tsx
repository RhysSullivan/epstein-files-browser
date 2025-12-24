'use client'

import { useMemo, useCallback } from 'react'
import { useQueryState } from 'nuqs'

import {
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
} from '@/lib/celebrity-data'
import { CelebrityCombobox } from '@/components/celebrity-combobox'
import { CelebrityDisclaimer } from '@/components/celebrity-disclaimer'
import { useFiles } from '@/lib/files-context'
import { getFileId } from '@/lib/utils'
import { prefetchPdf } from '@/lib/prefetchPdfs'
import { FileCard } from '@/components/file-card'
import { FileModal } from '@/components/file-modal'

export function FileBrowser() {
  const { files: initialFiles } = useFiles()

  const [collectionFilter, setCollectionFilter] = useQueryState('collection', {
    defaultValue: 'All',
  })
  const [celebrityFilter, setCelebrityFilter] = useQueryState('celebrity', {
    defaultValue: 'All',
  })
  const [sortBy, setSortBy] = useQueryState('sort', {
    defaultValue: 'name',
  })
  const [openFile, setOpenFile] = useQueryState('file')

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99)

  // Derive filtered and sorted files from initialFiles + filters
  const filteredFiles = useMemo(() => {
    let files = initialFiles

    // Apply collection filter
    if (collectionFilter !== 'All') {
      files = files.filter((f) => f.key.startsWith(collectionFilter))
    }

    // Apply celebrity filter
    if (celebrityFilter !== 'All') {
      const celebrityFileKeys = new Set(
        getFilesForCelebrity(celebrityFilter, 99)
      )
      files = files.filter((f) => celebrityFileKeys.has(f.key))
    }

    // Apply sorting
    files = [...files].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime()
        case 'date-asc':
          return new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime()
        case 'size-desc':
          return b.size - a.size
        case 'size-asc':
          return a.size - b.size
        case 'name':
        default:
          return getFileId(a.key).localeCompare(getFileId(b.key))
      }
    })

    return files
  }, [initialFiles, collectionFilter, celebrityFilter, sortBy])

  // Build query string to preserve filters in file links
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (collectionFilter !== 'All') params.set('collection', collectionFilter)
    if (celebrityFilter !== 'All') params.set('celebrity', celebrityFilter)
    const str = params.toString()
    return str ? `?${str}` : ''
  }, [collectionFilter, celebrityFilter])

  // Modal state - find index from file key
  const selectedFileIndex = useMemo(() => {
    if (!openFile) return null
    const index = filteredFiles.findIndex((f) => f.key === openFile)
    return index >= 0 ? index : null
  }, [openFile, filteredFiles])

  const selectedFile =
    selectedFileIndex !== null ? filteredFiles[selectedFileIndex] : null
  const hasPrev = selectedFileIndex !== null && selectedFileIndex > 0
  const hasNext =
    selectedFileIndex !== null && selectedFileIndex < filteredFiles.length - 1

  const handlePrev = useCallback(() => {
    if (selectedFileIndex !== null && selectedFileIndex > 0) {
      setOpenFile(filteredFiles[selectedFileIndex - 1].key)
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile])

  const handleNext = useCallback(() => {
    if (
      selectedFileIndex !== null &&
      selectedFileIndex < filteredFiles.length - 1
    ) {
      setOpenFile(filteredFiles[selectedFileIndex + 1].key)
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile])

  const handleClose = useCallback(() => {
    setOpenFile(null)
  }, [setOpenFile])

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-border bg-card/80 sticky top-0 z-10 border-b backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">
                  Epstein Files Browser
                </h1>
              </div>
            </div>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground rounded-xl p-2.5 transition-all duration-200 hover:scale-105"
              aria-label="View source on GitHub"
            >
              <svg
                className="h-5 w-5"
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="bg-secondary border-border text-foreground focus:ring-primary/50 focus:border-primary hover:bg-accent cursor-pointer appearance-none rounded-xl border px-4 py-2.5 pr-10 text-sm font-medium transition-all focus:ring-2 focus:outline-none"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">Volume 1</option>
                <option value="VOL00002">Volume 2</option>
                <option value="VOL00003">Volume 3</option>
                <option value="VOL00004">Volume 4</option>
                <option value="VOL00005">Volume 5</option>
                <option value="VOL00006">Volume 6</option>
                <option value="VOL00007">Volume 7</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg
                  className="text-muted-foreground h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
            <CelebrityCombobox
              celebrities={celebrities}
              value={celebrityFilter}
              onValueChange={(value) => setCelebrityFilter(value)}
            />

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-secondary border-border text-foreground focus:ring-primary/50 focus:border-primary hover:bg-accent cursor-pointer appearance-none rounded-xl border px-4 py-2.5 pr-10 text-sm font-medium transition-all focus:ring-2 focus:outline-none"
              >
                <option value="name">Sort by Name</option>
                <option value="size-desc">Largest First</option>
                <option value="size-asc">Smallest First</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg
                  className="text-muted-foreground h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            <div className="bg-secondary/50 flex items-center gap-2 rounded-xl px-3 py-2">
              <span className="text-muted-foreground text-sm font-medium">
                {filteredFiles.length.toLocaleString()} files
                {collectionFilter !== 'All' || celebrityFilter !== 'All' ? (
                  <span className="text-foreground/50">
                    {' '}
                    / {initialFiles.length.toLocaleString()}
                  </span>
                ) : (
                  ''
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== 'All' && (
        <CelebrityDisclaimer className="text-amber-200/90 [&_a]:text-amber-300 [&_a]:hover:text-amber-100" />
      )}

      {/* File Grid */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredFiles.map((file) => (
            <FileCard
              key={file.key}
              file={file}
              onClick={() => setOpenFile(file.key)}
              onMouseEnter={() => prefetchPdf(file.key)}
            />
          ))}
        </div>

        {/* Empty state */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-secondary mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <svg
                className="text-muted-foreground h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-foreground mb-1 text-lg font-semibold">
              No files found
            </h3>
            <p className="text-muted-foreground text-sm">
              Try adjusting your filters to find what you&apos;re looking for.
            </p>
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
          nextFiles={
            selectedFileIndex !== null
              ? filteredFiles.slice(
                  selectedFileIndex + 1,
                  selectedFileIndex + 6
                )
              : []
          }
        />
      )}
    </div>
  )
}
