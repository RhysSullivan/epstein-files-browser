import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Analytics } from "@vercel/analytics/next";
import { FilesProvider } from "@/lib/files-context";
import { FileItem } from "@/lib/cache";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Epstein Files Browser",
  description: "Browse and view the released Epstein files",
};

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const files = await fetchAllFiles();

  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable} antialiased`}
      >
        <FilesProvider files={files}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </FilesProvider>
        <Analytics />
      </body>
    </html>
  );
}
