import { getPayload } from 'payload'
import config from '@payload-config'

export const regenerateMedia = async () => {
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
  return 'Done!'
}

export const regenerateSingleMedia = async (id: string) => {
  const payload = await getPayload({ config })

  // Fetch the media document by ID
  const mediaDoc = await payload.findByID({
    collection: 'media',
    id,
    depth: 0,
  })

  if (!mediaDoc) {
    payload.logger.info(`Media with ID ${id} not found.`)
    return `Media with ID ${id} not found.`
  }

  try {
    await payload.update({
      collection: 'media',
      id,
      data: mediaDoc,
      overwriteExistingFiles: true,
    })
    payload.logger.info(`Media ${id} (${mediaDoc.filename}) regenerated.`)
    return `Media ${id} regenerated.`
  } catch (err) {
    payload.logger.error(`Failed to regenerate ${id} (${mediaDoc.filename})`)
    console.error(err)
    return `Failed to regenerate ${id}.`
  }
}
