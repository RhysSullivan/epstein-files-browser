import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Analytics } from "@vercel/analytics/next";
import { FilesProvider } from "@/lib/files-context";
import { FileItem, PdfManifest } from "@/lib/cache";
import staticFiles from "@/lib/static-files.json";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Epstein Files Browser",
  description: "Browse and view the released Epstein files",
};

// Type the imported JSON data
const files: FileItem[] = staticFiles as FileItem[];

// For SSG, we don't fetch PDF manifest at build time
// It will be fetched by the worker if needed
const pdfManifest: PdfManifest = {};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FilesProvider files={files} pdfManifest={pdfManifest}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </FilesProvider>
        <Analytics />
      </body>
    </html>
  );
}
