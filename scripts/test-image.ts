import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition"
import * as fs from "fs"

const imagePath = process.argv[2]
if (!imagePath) {
  console.error("Usage: bun run scripts/test-image.ts <image-path>")
  process.exit(1)
}

console.log(`Processing: ${imagePath}`)
const imageBuffer = fs.readFileSync(imagePath)

const rekognition = new RekognitionClient({ region: "us-east-1" })
const response = await rekognition.send(
  new RecognizeCelebritiesCommand({ Image: { Bytes: imageBuffer } })
)

if (response.CelebrityFaces?.length) {
  for (const c of response.CelebrityFaces) {
    console.log(`Found: ${c.Name} (${c.MatchConfidence?.toFixed(1)}%)`)
  }
} else {
  console.log("No celebrities detected")
}
