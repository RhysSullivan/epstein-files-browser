import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

const FILES_DIR = path.join(process.cwd(), "files");
const OUTPUT_DIR = path.join(process.cwd(), "pdfs-as-jpegs");
const BUCKET_NAME = "epstein-files";
const R2_REMOTE = "r2";
const IMAGE_WIDTH = 1200; // Width in pixels
const JPEG_QUALITY = 80;

interface ManifestEntry {
  pages: number;
}

type Manifest = Record<string, ManifestEntry>;

// Find all PDFs
function findPdfs(dir: string): string[] {
  const pdfs: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".pdf")) {
        pdfs.push(fullPath);
      }
    }
  }

  walk(dir);
  return pdfs;
}

// Get page count from PDF using pdftoppm dry run
function getPdfPageCount(pdfPath: string): number {
  try {
    // Use pdfinfo to get page count (faster than pdftoppm)
    const output = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep "^Pages:"`, {
      encoding: "utf-8",
    });
    const match = output.match(/Pages:\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    // Fallback: try to render and count output files
    return 0;
  }
}

// Generate all page images for a PDF
async function generatePdfImages(
  pdfPath: string,
  outputDir: string
): Promise<number> {
  try {
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tempPrefix = path.join(outputDir, "temp");

    // Extract all pages as PNG using pdftoppm
    // -scale-to sets the larger dimension (width for portrait pages)
    execSync(
      `pdftoppm -png -scale-to ${IMAGE_WIDTH} "${pdfPath}" "${tempPrefix}"`,
      { stdio: "pipe" }
    );

    // Find all generated temp files and convert to JPEG
    const tempFiles = fs.readdirSync(outputDir).filter((f) => f.startsWith("temp-") && f.endsWith(".png"));
    
    // Sort to ensure correct page order
    tempFiles.sort((a, b) => {
      const numA = parseInt(a.match(/temp-(\d+)\.png/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/temp-(\d+)\.png/)?.[1] || "0", 10);
      return numA - numB;
    });

    let pageCount = 0;
    for (const tempFile of tempFiles) {
      pageCount++;
      const tempPath = path.join(outputDir, tempFile);
      const pageNum = String(pageCount).padStart(3, "0");
      const jpegPath = path.join(outputDir, `page-${pageNum}.jpg`);

      // Convert to JPEG with sharp
      await sharp(tempPath).jpeg({ quality: JPEG_QUALITY }).toFile(jpegPath);

      // Clean up temp file
      fs.unlinkSync(tempPath);
    }

    return pageCount;
  } catch (err) {
    console.error(`\nFailed to generate images for ${pdfPath}:`, err);
    return 0;
  }
}

// Check if PDF images already exist and are complete
function checkExistingImages(outputDir: string, expectedPages?: number): { exists: boolean; pages: number } {
  if (!fs.existsSync(outputDir)) {
    return { exists: false, pages: 0 };
  }

  const jpegFiles = fs.readdirSync(outputDir).filter((f) => f.startsWith("page-") && f.endsWith(".jpg"));
  
  if (jpegFiles.length === 0) {
    return { exists: false, pages: 0 };
  }

  // If we know expected pages, check if complete
  if (expectedPages !== undefined && jpegFiles.length !== expectedPages) {
    return { exists: false, pages: jpegFiles.length };
  }

  return { exists: true, pages: jpegFiles.length };
}

// Upload to R2 using rclone
function uploadToR2(localDir: string, r2Path: string): boolean {
  try {
    execSync(
      `rclone copy "${localDir}" "${R2_REMOTE}:${BUCKET_NAME}/${r2Path}" --progress`,
      { stdio: "inherit" }
    );
    return true;
  } catch (err) {
    console.error(`Failed to upload ${r2Path}:`, err);
    return false;
  }
}

// Upload entire output directory to R2
function uploadAllToR2(): boolean {
  console.log("\n=== Uploading all images to R2 ===\n");
  try {
    execSync(
      `rclone copy "${OUTPUT_DIR}" "${R2_REMOTE}:${BUCKET_NAME}/pdfs-as-jpegs" --progress --transfers=32`,
      { stdio: "inherit" }
    );
    return true;
  } catch (err) {
    console.error("Failed to upload to R2:", err);
    return false;
  }
}

async function main() {
  const mode = process.argv[2] || "all"; // "generate", "upload", or "all"
  const limitArg = process.argv[3];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log("Finding PDFs...");
  let pdfs = findPdfs(FILES_DIR);
  console.log(`Found ${pdfs.length} PDFs`);

  if (limit) {
    pdfs = pdfs.slice(0, limit);
    console.log(`Limiting to first ${limit} PDFs for testing`);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load existing manifest if it exists
  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  let manifest: Manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    console.log(`Loaded existing manifest with ${Object.keys(manifest).length} entries`);
  }

  if (mode === "all" || mode === "generate") {
    console.log("\n=== Generating PDF images ===\n");

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < pdfs.length; i++) {
      const pdfPath = pdfs[i];
      const relativePath = path.relative(FILES_DIR, pdfPath);
      const pdfKey = relativePath; // e.g., "VOL00001/IMAGES/0001/EFTA00000515.pdf"
      const outputSubdir = relativePath.replace(".pdf", ""); // e.g., "VOL00001/IMAGES/0001/EFTA00000515"
      const localOutputDir = path.join(OUTPUT_DIR, outputSubdir);

      // Check if already processed
      const existingEntry = manifest[pdfKey];
      if (existingEntry) {
        const { exists, pages } = checkExistingImages(localOutputDir, existingEntry.pages);
        if (exists && pages === existingEntry.pages) {
          skipped++;
          continue;
        }
      }

      process.stdout.write(
        `\r[${i + 1}/${pdfs.length}] Processing ${path.basename(relativePath)}...                    `
      );

      const pageCount = await generatePdfImages(pdfPath, localOutputDir);
      
      if (pageCount > 0) {
        manifest[pdfKey] = { pages: pageCount };
        generated++;

        // Save manifest periodically (every 100 files)
        if (generated % 100 === 0) {
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }
      } else {
        failed++;
      }
    }

    // Save final manifest
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(
      `\n\nGeneration complete: ${generated} generated, ${skipped} skipped, ${failed} failed`
    );
    console.log(`Manifest saved with ${Object.keys(manifest).length} entries`);
  }

  if (mode === "all" || mode === "upload") {
    uploadAllToR2();
    console.log("\nUpload complete!");
  }

  console.log("\nDone!");
}

main().catch(console.error);
