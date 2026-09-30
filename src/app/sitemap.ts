import type { MetadataRoute } from 'next'
import { getPublicCatalog } from './server/content'
import { SITE } from './data/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return ['/', '/directory', ...(await getPublicCatalog()).filter((entry) => entry.kind === 'experiment').map((entry) => new URL(entry.url).pathname)].map((path) => ({
    url: new URL(path, SITE.url).href,
  }))
}
