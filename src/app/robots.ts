import type { MetadataRoute } from 'next'
import { getServerSideURL } from '@/utilities/getURL'
export default function robots(): MetadataRoute.Robots {
  const url = getServerSideURL()

  return {
    rules: [
      {
        userAgent: 'GoogleBot',
        allow: '/',
        disallow: '/dashboard',
      },
    ],
    sitemap: `${url}/sitemap.xml`,
  }
}
