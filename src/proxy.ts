import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getRedirects } from '@/utilities/getRedirects'

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip api, dashboard, and static files to improve performance
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  try {
    // Using your utility to get all redirects from Payload
    const redirects = await getRedirects()

    // Find matching redirect with normalization
    const redirectDoc = redirects.find((r: any) => {
      let from = r.from

      // Handle full URLs if they were pasted into the 'from' field
      try {
        if (from.startsWith('http')) {
          const url = new URL(from)
          from = url.pathname
        }
      } catch (_e) { }

      // Normalize slashes for comparison
      from = from.replace(/\/$/, '') || '/'
      if (!from.startsWith('/')) from = `/${from}`

      let current = pathname.replace(/\/$/, '') || '/'
      if (!current.startsWith('/')) current = `/${current}`

      return from.toLowerCase() === current.toLowerCase()
    })

    if (redirectDoc) {
      let destination = ''

      if (redirectDoc.to?.url) {
        destination = redirectDoc.to.url
      } else if (
        typeof redirectDoc.to?.reference?.value === 'object' &&
        redirectDoc.to.reference.value &&
        'slug' in redirectDoc.to.reference.value
      ) {
        const collection = redirectDoc.to.reference.relationTo
        const slug = redirectDoc.to.reference.value.slug
        // Defaulting to /posts/ for the posts collection
        destination = collection === 'posts' ? `/posts/${slug}` : `/${slug}`
      }

      if (destination) {
        return NextResponse.redirect(new URL(destination, request.url), 301)
      }
    }
  } catch (error) {
    console.error('Error in redirect proxy:', error)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
