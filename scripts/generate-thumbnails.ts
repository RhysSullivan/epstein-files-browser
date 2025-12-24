import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

const FILES_DIR = path.join(process.cwd(), "files");
const THUMBNAILS_DIR = path.join(process.cwd(), "thumbnails");
const BUCKET_NAME = "epstein-files";
const CONCURRENT_UPLOADS = 10;

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

async function generateThumbnail(
  pdfPath: string,
  outputPath: string
): Promise<boolean> {
  try {
    const tempPrefix = outputPath.replace(".jpg", "-temp");

    // pdftoppm outputs to {prefix}-{page}.png
    execSync(
      `pdftoppm -png -f 1 -l 1 -scale-to 300 "${pdfPath}" "${tempPrefix}"`,
      { stdio: "pipe" }
    );

    // pdftoppm adds -1 or -01 suffix depending on total pages
    let actualTempPng = `${tempPrefix}-1.png`;
    if (!fs.existsSync(actualTempPng)) {
      actualTempPng = `${tempPrefix}-01.png`;
    }
    if (!fs.existsSync(actualTempPng)) {
      actualTempPng = `${tempPrefix}-001.png`;
    }

    if (!fs.existsSync(actualTempPng)) {
      console.error(`No output generated for ${pdfPath}`);
      return false;
    }

    // Convert to JPEG with sharp for smaller size
    await sharp(actualTempPng).jpeg({ quality: 70 }).toFile(outputPath);

    // Clean up temp file
    fs.unlinkSync(actualTempPng);

    return true;
  } catch (err) {
    console.error(`Failed to generate thumbnail for ${pdfPath}:`, err);
    return false;
  }
}

function uploadToR2(localPath: string, r2Key: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file="${localPath}" --content-type="image/jpeg"`,
      { maxBuffer: 10 * 1024 * 1024 },
      (error) => {
        if (error) {
          console.error(`Failed to upload ${r2Key}:`, error.message);
          resolve(false);
        } else {
          resolve(true);
        }
      }
    );
  });
}

async function uploadBatch(
  items: { localPath: string; r2Key: string }[]
): Promise<number> {
  const results = await Promise.all(
    items.map(({ localPath, r2Key }) => uploadToR2(localPath, r2Key))
  );
  return results.filter(Boolean).length;
}

async function main() {
  const mode = process.argv[2] || "all"; // "generate", "upload", or "all"

  console.log("Finding PDFs...");
  const pdfs = findPdfs(FILES_DIR);
  console.log(`Found ${pdfs.length} PDFs`);

  // Create thumbnails directory
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }

  const toUpload: { localPath: string; r2Key: string }[] = [];

  if (mode === "all" || mode === "generate") {
    console.log("\n=== Generating thumbnails ===\n");

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const pdfPath of pdfs) {
      const relativePath = path.relative(FILES_DIR, pdfPath);
      const localThumbnailPath = path.join(
        THUMBNAILS_DIR,
        relativePath.replace(".pdf", ".jpg")
      );

      // Create subdirectories
      const thumbnailDir = path.dirname(localThumbnailPath);
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      // Skip if already exists locally
      if (fs.existsSync(localThumbnailPath)) {
        skipped++;
        toUpload.push({
          localPath: localThumbnailPath,
          r2Key: `thumbnails/${relativePath.replace(".pdf", ".jpg")}`,
        });
        continue;
      }

      const idx = generated + skipped + failed + 1;
      process.stdout.write(
        `\r[${idx}/${pdfs.length}] Generating ${path.basename(relativePath)}...`
      );

      const success = await generateThumbnail(pdfPath, localThumbnailPath);
      if (success) {
        generated++;
        toUpload.push({
          localPath: localThumbnailPath,
          r2Key: `thumbnails/${relativePath.replace(".pdf", ".jpg")}`,
        });
      } else {
        failed++;
      }
    }

    console.log(
      `\n\nGeneration complete: ${generated} generated, ${skipped} skipped, ${failed} failed`
    );
  } else {
    // Just collect existing thumbnails for upload
    for (const pdfPath of pdfs) {
      const relativePath = path.relative(FILES_DIR, pdfPath);
      const localThumbnailPath = path.join(
        THUMBNAILS_DIR,
        relativePath.replace(".pdf", ".jpg")
      );
      if (fs.existsSync(localThumbnailPath)) {
        toUpload.push({
          localPath: localThumbnailPath,
          r2Key: `thumbnails/${relativePath.replace(".pdf", ".jpg")}`,
        });
      }
    }
  }

  if (mode === "all" || mode === "upload") {
    console.log(`\n=== Uploading ${toUpload.length} thumbnails to R2 ===\n`);

    let uploaded = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < toUpload.length; i += CONCURRENT_UPLOADS) {
      const batch = toUpload.slice(i, i + CONCURRENT_UPLOADS);
      const successCount = await uploadBatch(batch);
      uploaded += successCount;
      failed += batch.length - successCount;

      process.stdout.write(
        `\r[${Math.min(i + CONCURRENT_UPLOADS, toUpload.length)}/${toUpload.length}] Uploaded ${uploaded}, failed ${failed}`
      );
    }

    console.log(`\n\nUpload complete: ${uploaded} uploaded, ${failed} failed`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
