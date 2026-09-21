import type { MetadataRoute } from 'next'
import { EXPERIMENTS } from './data/experiments'
import { SITE } from './data/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/directory', ...EXPERIMENTS.map(({ href }) => href)].map((path) => ({
    url: new URL(path, SITE.url).href,
  }))
}
