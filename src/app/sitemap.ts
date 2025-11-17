import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getServerSideURL } from '@/utilities/getURL'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    limit: 0,
    where: {},
  })

  const url = getServerSideURL()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${url}/`, lastModified: new Date() },
    { url: `${url}/info`, lastModified: new Date() },
    { url: `${url}/dev`, lastModified: new Date() },
    { url: `${url}/art`, lastModified: new Date() },
    { url: `${url}/posts`, lastModified: new Date() },
  ]

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
}
