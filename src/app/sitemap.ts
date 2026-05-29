import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getServerSideURL } from '@/utilities/getURL'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = getServerSideURL()
  const staticRoutes: MetadataRoute.Sitemap = [{ url: `${url}/`, lastModified: new Date() }]

  try {
    const payload = await getPayload({ config: configPromise })
    const posts = await payload.find({
      collection: 'posts',
      limit: 0,
      where: {
        _status: { equals: 'published' },
      },
    })

    return [
      ...staticRoutes,
      ...posts.docs.map(({ slug, updatedAt }) => ({
        url: `${url}/en/${slug}`,
        lastModified: new Date(updatedAt),
        alternates: {
          languages: {
            es: `${url}/es/${slug}`,
          },
        },
      })),
    ]
  } catch (error) {
    console.warn(
      '[sitemap] Could not fetch posts (database unavailable or not migrated); using static routes only.',
      error,
    )
    return staticRoutes
  }
}
