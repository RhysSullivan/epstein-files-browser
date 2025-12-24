import { writeFileSync } from "fs"
import { join } from "path"

const WORKER_URL =
  process.env.WORKER_URL || "https://epstein-files.rhys-669.workers.dev"

interface FileItem {
  key: string
  size: number
  uploaded: string
}

interface AllFilesResponse {
  files: FileItem[]
  totalReturned: number
}

async function fetchAllFiles(): Promise<FileItem[]> {
  console.log(`Fetching all files from ${WORKER_URL}/api/all-files...`)

  const response = await fetch(`${WORKER_URL}/api/all-files`)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch files: ${response.status} ${response.statusText}`
    )
  }

  const data: AllFilesResponse = await response.json()
  console.log(`✓ Fetched ${data.files.length} files`)

  return data.files
}

async function main() {
  try {
    const files = await fetchAllFiles()

    // Write to a JSON file that can be imported statically
    const outputPath = join(process.cwd(), "lib", "static-files.json")
    writeFileSync(outputPath, JSON.stringify(files, null, 2))

    console.log(`✓ Wrote ${files.length} files to ${outputPath}`)
    console.log(
      `  Total size: ${(JSON.stringify(files).length / 1024 / 1024).toFixed(2)} MB`
    )
  } catch (error) {
    console.error("Error fetching files:", error)
    process.exit(1)
  }
}

main()
