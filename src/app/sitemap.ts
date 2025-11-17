import type { MetadataRoute } from 'next'
import { getServerSideURL } from '@/utilities/getURL'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = getServerSideURL()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${url}/`, lastModified: new Date() },
    { url: `${url}/info`, lastModified: new Date() },
    { url: `${url}/dev`, lastModified: new Date() },
    { url: `${url}/art`, lastModified: new Date() },
  ]

  return staticRoutes
}
