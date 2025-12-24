import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition"
import * as fs from "fs"
import * as path from "path"
import { execSync, exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Configurable concurrency - AWS Rekognition default limit is 5 TPS
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "10")

// Initialize Rekognition client
const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
})

interface CelebrityMatch {
  name: string
  confidence: number
  urls: string[]
}

interface PageResult {
  file: string
  page: number
  totalPages: number
  celebrities: CelebrityMatch[]
  error?: string
}

interface ProcessingResults {
  processedAt: string
  totalImages: number
  imagesWithCelebrities: number
  uniqueCelebrities: string[]
  celebrityAppearances: Record<
    string,
    { file: string; page: number; confidence: number }[]
  >
  results: PageResult[]
}

interface PageTask {
  pdfPath: string
  page: number
  totalPages: number
}

function getPageCount(pdfPath: string): number {
  try {
    const pdfInfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: "utf-8" })
    const match = pdfInfo.match(/Pages:\s+(\d+)/)
    return match ? parseInt(match[1]) : 1
  } catch {
    return 1
  }
}

async function recognizeCelebrities(
  imageBuffer: Buffer,
  retries = 3
): Promise<CelebrityMatch[]> {
  try {
    const command = new RecognizeCelebritiesCommand({
      Image: { Bytes: imageBuffer },
    })

    const response = await rekognition.send(command)
    const celebrities: CelebrityMatch[] = []

    if (response.CelebrityFaces) {
      for (const celeb of response.CelebrityFaces) {
        if (celeb.Name && celeb.MatchConfidence) {
          celebrities.push({
            name: celeb.Name,
            confidence: celeb.MatchConfidence,
            urls: celeb.Urls || [],
          })
        }
      }
    }

    return celebrities
  } catch (error) {
    const errName = (error as Error).name
    if (
      (errName === "ThrottlingException" ||
        errName === "ProvisionedThroughputExceededException") &&
      retries > 0
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000)
      )
      return recognizeCelebrities(imageBuffer, retries - 1)
    }
    throw error
  }
}

async function processPage(task: PageTask): Promise<PageResult> {
  const { pdfPath, page, totalPages } = task
  const result: PageResult = {
    file: pdfPath,
    page,
    totalPages,
    celebrities: [],
  }

  const tempFile = `/tmp/pdf-page-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`

  try {
    // Use 72 DPI - faster and still good enough for face detection
    await execAsync(
      `pdftoppm -png -r 72 -f ${page} -l ${page} -singlefile "${pdfPath}" "${tempFile.replace(".png", "")}"`
    )

    const imageBuffer = fs.readFileSync(tempFile)
    result.celebrities = await recognizeCelebrities(imageBuffer)

    fs.unlinkSync(tempFile)
  } catch (error) {
    result.error = (error as Error).message
    try {
      fs.unlinkSync(tempFile)
    } catch {}
  }

  return result
}

async function findPdfFiles(dir: string): Promise<string[]> {
  const pdfFiles: string[] = []

  function walkDir(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walkDir(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        pdfFiles.push(fullPath)
      }
    }
  }

  walkDir(dir)
  return pdfFiles.sort()
}

// Process tasks with limited concurrency
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R) => void
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  let completedCount = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      const item = items[index]
      const result = await processor(item, index)
      results[index] = result
      completedCount++
      if (onProgress) {
        onProgress(completedCount, items.length, result)
      }
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker())

  await Promise.all(workers)
  return results
}

function saveResults(outputPath: string, results: PageResult[]) {
  const uniqueCelebrities = new Set<string>()
  const celebrityAppearances: Record<
    string,
    { file: string; page: number; confidence: number }[]
  > = {}

  for (const r of results) {
    for (const c of r.celebrities) {
      uniqueCelebrities.add(c.name)
      if (!celebrityAppearances[c.name]) {
        celebrityAppearances[c.name] = []
      }
      celebrityAppearances[c.name].push({
        file: r.file,
        page: r.page,
        confidence: c.confidence,
      })
    }
  }

  for (const name of Object.keys(celebrityAppearances)) {
    celebrityAppearances[name].sort((a, b) => b.confidence - a.confidence)
  }

  const output: ProcessingResults = {
    processedAt: new Date().toISOString(),
    totalImages: results.length,
    imagesWithCelebrities: results.filter((r) => r.celebrities.length > 0)
      .length,
    uniqueCelebrities: Array.from(uniqueCelebrities).sort(),
    celebrityAppearances,
    results,
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
}

async function main() {
  const filesDir = path.join(process.cwd(), "files")
  const limit = parseInt(process.argv[2] || "0") || Infinity

  try {
    execSync("which pdftoppm", { stdio: "pipe" })
  } catch {
    console.error(
      "Error: pdftoppm not found. Install with: brew install poppler"
    )
    process.exit(1)
  }

  console.log(`Concurrency: ${CONCURRENCY} parallel tasks`)
  console.log("Finding PDF files...")
  const pdfFiles = await findPdfFiles(filesDir)
  console.log(`Found ${pdfFiles.length} PDF files\n`)

  const outputPath = path.join(process.cwd(), "celebrity-results.json")

  // Load existing results for resume capability
  let processedKeys = new Set<string>()
  let existingResults: PageResult[] = []

  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(outputPath, "utf-8")
      ) as ProcessingResults
      existingResults = existing.results
      processedKeys = new Set(
        existing.results.map((r) => `${r.file}:${r.page}`)
      )
      console.log(
        `Resuming (${existingResults.length} pages already processed)\n`
      )
    } catch {
      console.log("Starting fresh...\n")
    }
  }

  // Build list of all page tasks that need processing
  const tasks: PageTask[] = []
  let filesConsidered = 0

  for (const pdfPath of pdfFiles) {
    if (filesConsidered >= limit) break

    const pageCount = getPageCount(pdfPath)
    let hasUnprocessedPages = false

    for (let page = 1; page <= pageCount; page++) {
      const key = `${pdfPath}:${page}`
      if (!processedKeys.has(key)) {
        tasks.push({ pdfPath, page, totalPages: pageCount })
        hasUnprocessedPages = true
      }
    }

    if (hasUnprocessedPages) {
      filesConsidered++
    }
  }

  console.log(
    `Tasks to process: ${tasks.length} pages from ${filesConsidered} files\n`
  )

  if (tasks.length === 0) {
    console.log("Nothing to process!")
    return
  }

  const results: PageResult[] = [...existingResults]
  let celebsFound = 0
  let lastSaveTime = Date.now()
  const startTime = Date.now()

  await processWithConcurrency(
    tasks,
    CONCURRENCY,
    async (task) => {
      return await processPage(task)
    },
    (completed, total, result) => {
      results.push(result)

      if (result.celebrities.length > 0) {
        celebsFound++
        console.log(
          `[${completed}/${total}] ${path.basename(result.file)} p${result.page}: ${result.celebrities.map((c) => `${c.name} (${c.confidence.toFixed(1)}%)`).join(", ")}`
        )
      } else if (completed % 50 === 0 || completed === total) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = completed / elapsed
        const remaining = (total - completed) / rate
        console.log(
          `[${completed}/${total}] Progress: ${((completed / total) * 100).toFixed(1)}% | ${rate.toFixed(1)} pages/sec | ETA: ${Math.ceil(remaining / 60)} min`
        )
      }

      // Save every 30 seconds
      if (Date.now() - lastSaveTime > 30000) {
        saveResults(outputPath, results)
        lastSaveTime = Date.now()
      }
    }
  )

  // Final save
  saveResults(outputPath, results)

  // Summary
  const uniqueCelebs = new Set<string>()
  for (const r of results) {
    for (const c of r.celebrities) {
      uniqueCelebs.add(c.name)
    }
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log("\n========== SUMMARY ==========")
  console.log(`Total time: ${(elapsed / 60).toFixed(1)} minutes`)
  console.log(`Total images processed: ${results.length}`)
  console.log(
    `Images with celebrities: ${results.filter((r) => r.celebrities.length > 0).length}`
  )
  console.log(`Unique celebrities: ${uniqueCelebs.size}`)
  console.log(`\nResults saved to: celebrity-results.json`)
  console.log(`Estimated cost: $${(results.length * 0.001).toFixed(2)}`)
}

main().catch(console.error)
