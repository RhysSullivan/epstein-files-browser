import { FileItem } from "@/lib/cache";
import { FileBrowser } from "./file-browser";

const WORKER_URL = "https://epstein-files.rhys-669.workers.dev";

interface AllFilesResponse {
  files: FileItem[];
  totalReturned: number;
}

async function fetchAllFiles(): Promise<FileItem[]> {
  const response = await fetch(`${WORKER_URL}/api/all-files`, {
    next: { revalidate: 3600 }, // Revalidate every hour
  });

  if (!response.ok) {
    throw new Error("Failed to fetch files");
  }

  const data: AllFilesResponse = await response.json();
  return data.files;
}

export default async function Home() {
  const files = await fetchAllFiles();

  return <FileBrowser initialFiles={files} />;
}
