import { getPayload } from 'payload'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load environment variables
dotenv.config()

// Determine __dirname (ES Module compatible)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Adjust the config path relative to this script's location
const payloadConfigPath = path.join(__dirname, '../src/payload.config.ts')

async function main() {
  // Dynamically import your Payload config
  const awaitedConfig = (await import(payloadConfigPath)).default
  const payload = await getPayload({ config: awaitedConfig })

  try {
    // Find media documents (limit set to 500)
    const media = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 500,
    })

    if (media && media.totalDocs > 0) {
      payload.logger.info(`Found ${media.totalDocs} media files.`)

      // Filter out video files
      const imageFiles = media.docs.filter((doc) => {
        if (!doc.mimeType) return true // Process if mimeType is unknown
        return !doc.mimeType.startsWith('video/')
      })

      payload.logger.info(
        `Processing ${imageFiles.length} image files (skipping ${media.totalDocs - imageFiles.length} video files).`,
      )

      for (let index = 0; index < imageFiles.length; index++) {
        const mediaDoc = imageFiles[index]

        try {
          await payload.update({
            collection: 'media',
            id: mediaDoc.id,
            data: mediaDoc,
            overwriteExistingFiles: true,
          })

          payload.logger.info(
            `Media ${mediaDoc.id} (${mediaDoc.filename}) successfully regenerated and new copy created.`,
          )
        } catch (err) {
          payload.logger.error(`Media ${mediaDoc.id} (${mediaDoc.filename}) failed to regenerate`)
          console.error(err)
        }
      }
    } else {
      payload.logger.info('No media files found.')
    }
  } catch (err) {
    payload.logger.error('Error while fetching media files.')
    console.error(err)
  }

  payload.logger.info('Done!')
  process.exit(0)
}

main()
