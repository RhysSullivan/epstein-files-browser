"use client";

import { useMemo, useCallback } from "react";
import { useQueryState } from "nuqs";
import { useFiles } from "@/lib/files-context";
import { getCelebritiesAboveConfidence, getFilesForCelebrity } from "@/lib/celebrity-utils";
import { CelebrityCombobox } from "@/components/celebrity-combobox";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";
import { FileCard } from "@/components/file-card";
import { FileModal } from "@/components/file-modal";

export function FileBrowser() {
  const { files: initialFiles } = useFiles();

  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });
  const [celebrityFilter, setCelebrityFilter] = useQueryState("celebrity", {
    defaultValue: "All",
  });
  const [openFile, setOpenFile] = useQueryState("file");

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99);

  // Derive filtered files from initialFiles + filters
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

    return files;
  }, [initialFiles, collectionFilter, celebrityFilter]);

  // Build query string to preserve filters in file links
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (collectionFilter !== "All") params.set("collection", collectionFilter);
    if (celebrityFilter !== "All") params.set("celebrity", celebrityFilter);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [collectionFilter, celebrityFilter]);

  // Modal state - find index from file key
  const selectedFileIndex = useMemo(() => {
    if (!openFile) return null;
    const index = filteredFiles.findIndex((f) => f.key === openFile);
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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  Epstein Files Browser
                </h1>
              </div>
            </div>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105"
              aria-label="View source on GitHub"
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
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-secondary border border-border rounded-xl text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer hover:bg-accent"
                aria-label="Filter by collection"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">Volume 1</option>
                <option value="VOL00002">Volume 2</option>
                <option value="VOL00003">Volume 3</option>
                <option value="VOL00004">Volume 4</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg
                  className="w-4 h-4 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <CelebrityCombobox
              celebrities={celebrities}
              value={celebrityFilter}
              onValueChange={(value) => setCelebrityFilter(value)}
            />

            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-xl">
              <span className="text-sm font-medium text-muted-foreground">
                {filteredFiles.length.toLocaleString()} files
                {collectionFilter !== "All" || celebrityFilter !== "All" ? (
                  <span className="text-foreground/50"> / {initialFiles.length.toLocaleString()}</span>
                ) : (
                  ""
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== "All" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-5 py-4 rounded-2xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
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

      {/* File Grid */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFiles.map((file) => (
            <FileCard key={file.key} file={file} onClick={() => setOpenFile(file.key)} />
          ))}
        </div>

        {/* Empty state */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No files found</h3>
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
          nextFile={hasNext && selectedFileIndex !== null ? filteredFiles[selectedFileIndex + 1] : null}
        />
      )}
    </div>
  );
}
