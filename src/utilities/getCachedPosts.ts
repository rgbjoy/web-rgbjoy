import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { unstable_cache } from 'next/cache'

async function getPosts() {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 12,
    where: {
      _status: { equals: 'published' },
    },
  })

  return posts
}

/**
 * Returns a unstable_cache function for posts query
 */
export const getCachedPosts = () =>
  unstable_cache(async () => getPosts(), ['posts'], {
    tags: ['posts'],
  })

