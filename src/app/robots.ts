import type { MetadataRoute } from 'next'
import { SITE } from './data/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/contact', '/dashboard'] },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
