import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition"
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const pdfPath = process.argv[2] || "files/VOL00002/IMAGES/0001/EFTA00003182.pdf"
console.log(`Processing: ${pdfPath}`)

// Get page count
const pdfInfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: "utf-8" })
const pageMatch = pdfInfo.match(/Pages:\s+(\d+)/)
const pageCount = pageMatch ? parseInt(pageMatch[1]) : 1
console.log(`Pages: ${pageCount}`)

const rekognition = new RekognitionClient({ region: "us-east-1" })
const allCelebs = new Map<string, { confidence: number; page: number }>()

for (let page = 1; page <= pageCount; page++) {
  const tempFile = `/tmp/pdf-page-${Date.now()}.png`

  try {
    // Convert one page at a time with lower resolution for large files
    execSync(
      `pdftoppm -png -r 100 -f ${page} -l ${page} -singlefile "${pdfPath}" "${tempFile.replace(".png", "")}"`,
      { stdio: "pipe" }
    )

    const imageBuffer = fs.readFileSync(tempFile)
    const command = new RecognizeCelebritiesCommand({
      Image: { Bytes: imageBuffer },
    })
    const response = await rekognition.send(command)

    if (response.CelebrityFaces?.length) {
      for (const celeb of response.CelebrityFaces) {
        if (celeb.Name && celeb.MatchConfidence) {
          const existing = allCelebs.get(celeb.Name)
          if (!existing || celeb.MatchConfidence > existing.confidence) {
            allCelebs.set(celeb.Name, {
              confidence: celeb.MatchConfidence,
              page,
            })
          }
        }
      }
    }

    fs.unlinkSync(tempFile)
    process.stdout.write(`\rProcessed page ${page}/${pageCount}`)
  } catch (err) {
    console.error(`\nError on page ${page}:`, err)
    try {
      fs.unlinkSync(tempFile)
    } catch {}
  }
}

console.log("\n")
if (allCelebs.size > 0) {
  const sorted = Array.from(allCelebs.entries()).sort(
    (a, b) => b[1].confidence - a[1].confidence
  )
  for (const [name, { confidence, page }] of sorted) {
    console.log(`Found: ${name} (${confidence.toFixed(1)}%) - page ${page}`)
  }
} else {
  console.log("No celebrities detected")
}
console.log(`\nCost: $${(pageCount * 0.001).toFixed(3)}`)
