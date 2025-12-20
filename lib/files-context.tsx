"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";
import { FileItem } from "./cache";
import { getFilesForCelebrity } from "./celebrity-utils";
import { getFileId } from "./constants";

interface FilesContextValue {
  files: FileItem[];
  getFilePath: (fileId: string) => string | null;
  getAdjacentFile: (currentPath: string, offset: number, filters?: { collection?: string; celebrity?: string }) => string | null;
}

const FilesContext = createContext<FilesContextValue | null>(null);

// Helper to get filtered file keys based on filters
function getFilteredFileKeys(
  allFiles: FileItem[],
  filters: { collection?: string; celebrity?: string }
): string[] {
  const { collection, celebrity } = filters;
  
  // Celebrity filter takes precedence
  if (celebrity && celebrity !== "All") {
    const celebrityFileKeys = getFilesForCelebrity(celebrity, 99);
    // Optionally filter by collection too
    if (collection && collection !== "All") {
      return celebrityFileKeys.filter((key) => key.startsWith(collection));
    }
    return celebrityFileKeys;
  }
  
  // Collection filter only
  if (collection && collection !== "All") {
    return allFiles.filter((f) => f.key.startsWith(collection)).map((f) => f.key);
  }
  
  // No filters - return all files
  return allFiles.map((f) => f.key);
}

export function FilesProvider({
  children,
  files,
}: {
  children: ReactNode;
  files: FileItem[];
}) {
  // Create a sorted list of file paths for navigation
  const sortedFiles = useMemo(() => 
    [...files].sort((a, b) => {
      const idA = getFileId(a.key);
      const idB = getFileId(b.key);
      return idA.localeCompare(idB);
    }),
    [files]
  );

  // Create a map from file ID to full path for quick lookup
  const fileIdToPath = useMemo(() => {
    const map = new Map<string, string>();
    sortedFiles.forEach((file) => {
      const id = getFileId(file.key);
      map.set(id, file.key);
    });
    return map;
  }, [sortedFiles]);

  // Get the full file path for a given file ID
  const getFilePath = (fileId: string): string | null => {
    return fileIdToPath.get(fileId) ?? null;
  };

  // Get adjacent file path (prev/next) with optional filters
  const getAdjacentFile = (
    currentPath: string, 
    offset: number,
    filters?: { collection?: string; celebrity?: string }
  ): string | null => {
    // Get the appropriate file list based on filters
    let fileKeys: string[];
    if (filters && (filters.collection !== "All" || filters.celebrity !== "All")) {
      fileKeys = getFilteredFileKeys(sortedFiles, filters);
      // Sort the filtered keys by file ID
      fileKeys.sort((a, b) => {
        const idA = getFileId(a);
        const idB = getFileId(b);
        return idA.localeCompare(idB);
      });
    } else {
      fileKeys = sortedFiles.map((f) => f.key);
    }
    
    const currentIndex = fileKeys.findIndex((key) => key === currentPath);
    if (currentIndex === -1) return null;

    const newIndex = currentIndex + offset;
    if (newIndex < 0 || newIndex >= fileKeys.length) return null;

    return fileKeys[newIndex];
  };

  return (
    <FilesContext.Provider value={{ files: sortedFiles, getFilePath, getAdjacentFile }}>
      {children}
    </FilesContext.Provider>
  );
}

export function useFiles() {
  const context = useContext(FilesContext);
  if (!context) {
    throw new Error("useFiles must be used within a FilesProvider");
  }
  return context;
}

// Optional hook that doesn't throw if context is missing
export function useFilesOptional() {
  return useContext(FilesContext);
}
