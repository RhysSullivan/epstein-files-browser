import staticFiles from "@/lib/static-files.json";
import FilePageClient from "./file-page-client";

// Generate static paths for all files at build time
export async function generateStaticParams() {
  // Use the static files data
  return staticFiles.map((file) => ({
    path: file.key.split("/"),
  }));
}

// Enable static generation
export const dynamicParams = false;

export default async function FilePage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const filePath = decodeURIComponent(path.join("/"));

  return <FilePageClient filePath={filePath} />;
}
