import { getPayload } from 'payload'
import config from '@payload-config'

const main = async () => {
  const payload = await getPayload({ config })

  const media = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 500,
  })

  if (!media || media.totalDocs === 0) {
    payload.logger.info('No media files found.')
    return
  }

  payload.logger.info(`Found ${media.totalDocs} media files.`)

  const imageFiles = media.docs.filter((doc) => {
    if (!doc.mimeType) return true
    return !doc.mimeType.startsWith('video/')
  })

  payload.logger.info(
    `Processing ${imageFiles.length} image files (skipping ${media.totalDocs - imageFiles.length} video files).`,
  )

  for (const mediaDoc of imageFiles) {
    try {
      await payload.update({
        collection: 'media',
        id: mediaDoc.id,
        data: mediaDoc,
        overwriteExistingFiles: true,
      })
      payload.logger.info(`Media ${mediaDoc.id} (${mediaDoc.filename}) regenerated.`)
    } catch (err) {
      payload.logger.error(`Failed to regenerate ${mediaDoc.id} (${mediaDoc.filename})`)
      console.error(err)
    }
  }

  payload.logger.info('Done!')
  process.exit(0)
}

main()
