import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Analytics } from "@vercel/analytics/next";
import { FilesProvider } from "@/lib/files-context";
import { FileItem, PdfManifest } from "@/lib/cache";
import "./globals.css";
import ScrollToTopButton from "@/components/scroll-to-top-button";

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
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Files Browser",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1f2937",
};

const WORKER_URL = "https://epstein-files.rhys-669.workers.dev";

interface AllFilesResponse {
  files: FileItem[];
  totalReturned: number;
}

async function fetchAllFiles(): Promise<FileItem[]> {
  try {
    console.log('Fetching files from:', `${WORKER_URL}/api/all-files`);
    const response = await fetch(`${WORKER_URL}/api/all-files`, {
      next: { revalidate: 3600 }, // Revalidate every hour
    });

    if (!response.ok) {
      console.error('Failed to fetch files:', response.status, response.statusText);
      throw new Error("Failed to fetch files");
    }

    const data: AllFilesResponse = await response.json();
    console.log('Files loaded:', data.totalReturned);
    return data.files;
  } catch (error) {
    console.error('Error fetching files:', error);
    throw error;
  }
}

async function fetchPdfManifest(): Promise<PdfManifest> {
  try {
    console.log('Fetching PDF manifest from:', `${WORKER_URL}/api/pdf-manifest`);
    const response = await fetch(`${WORKER_URL}/api/pdf-manifest`, {
      next: { revalidate: 3600 }, // Revalidate every hour
    });

    if (!response.ok) {
      console.warn("PDF manifest not available, falling back to PDF rendering");
      return {};
    }

    const manifest: PdfManifest = await response.json();
    console.log('PDF manifest loaded, entries:', Object.keys(manifest).length);
    return manifest;
  } catch (error) {
    console.warn("Failed to fetch PDF manifest:", error);
    return {};
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [files, pdfManifest] = await Promise.all([
    fetchAllFiles(),
    fetchPdfManifest(),
  ]);

  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Files Browser" />
        <meta name="theme-color" content="#1f2937" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div id="theme-transition-overlay" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {try {var s = localStorage.getItem('theme'); var m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; var r = document.documentElement; if (s === 'dark' || ((s === 'system' || !s) && m)) { r.classList.add('dark'); } else { r.classList.remove('dark'); }} catch (e) { /* noop */ }})();`}
        </Script>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(registration) {
                    console.log('Service Worker registered successfully:', registration);
                  })
                  .catch(function(error) {
                    console.error('Service Worker registration failed:', error);
                    console.error('Error details:', error.message);
                  });
              });
            } else {
              console.warn('Service Workers are not supported in this browser');
            }
          `}
        </Script>
        <FilesProvider files={files} pdfManifest={pdfManifest}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </FilesProvider>
        <ScrollToTopButton />
        <Analytics />
      </body>
    </html>
  );
}
