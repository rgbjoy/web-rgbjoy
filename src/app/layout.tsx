import { env } from "cloudflare:workers"
import { mediaUrl } from "./data/media"
import { getPublicCatalog, getSeo, getInfo, getSettings } from "./server/content"
import { getPageSeo } from "./server/page-seo"
import { PortfolioProvider } from "./utilities/PortfolioProvider"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { Geist, Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google"

import { SITE } from "./data/site"
import { serializeJsonLd, SITE_STRUCTURED_DATA } from "./data/structured-data"
import { RolloverChroma } from "./utilities/RolloverChroma"
import { SETTINGS_BOOT_SCRIPT } from "./utilities/settings/constants"
import SearchPalette from "./utilities/SearchPalette/SearchPalette"
import { PageTransitions } from "./utilities/PageTransitions"
import "./globals.css"

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// Reading text on the index: descriptions and the intro. The mono stays for
// labels, Instrument Serif for titles.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

// Kept for SearchPalette, which still references these CSS variables.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

/* Display face for titles: a narrow, high-contrast serif in the manner of
   book jackets. One weight; the italic is loaded too so it is never faked. */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
})

// Keep HTML and RSC fresh; the shared content snapshot is cached separately.
export const dynamic = 'force-dynamic'

const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  authors: [{ name: SITE.author, url: SITE.url }],
  creator: SITE.author,
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary",
    title: SITE.title,
    description: SITE.description,
    creator: SITE.handle,
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo()
  const page = await getPageSeo(seo)
  const info = await getInfo()
  const media = (await getSettings()).media
  const icon = media.find(image => image.kind === 'icon')
  const social = media.find(image => image.kind === 'social')
  // Local D1/R2 uploads exist only in the local runtime. Point development
  // metadata at that same origin instead of the production media bucket.
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
  const mediaOrigin = process.env.NODE_ENV === 'development' && host
    ? `${protocol}://${host}`
    : env.MEDIA_PUBLIC_URL
  const siteOrigin = process.env.NODE_ENV === 'development' && host ? `${protocol}://${host}` : SITE.url
  const imageUrl = page.image ? new URL(page.image, siteOrigin).href
    : social ? new URL(mediaUrl(social.version, 'social-1200.png'), mediaOrigin).href : undefined
  const images = imageUrl ? [{ url: imageUrl, width: 1200, height: 630, alt: page.title }] : undefined
  return {
    ...defaultMetadata, title: page.title, description: page.description,
    authors: [{ name: info.author, url: SITE.url }], creator: info.author,
    icons: icon ? {
      icon: [{ url: mediaUrl(icon.version, 'icon-32.png'), sizes: '32x32', type: 'image/png' }, { url: mediaUrl(icon.version, 'icon-512.png'), sizes: '512x512', type: 'image/png' }],
      apple: [{ url: mediaUrl(icon.version, 'apple-180.png'), sizes: '180x180', type: 'image/png' }],
    } : { icon: '/default-favicon.ico', apple: '/default-icon.png' },
    openGraph: { ...defaultMetadata.openGraph, ...page, images },
    twitter: { ...defaultMetadata.twitter, title: page.title, description: page.description, card: images ? 'summary_large_image' : 'summary', images: images?.map(image => image.url) },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const entries = await getPublicCatalog()
  const info = await getInfo()
  const seo = await getSeo()
  const structuredData = { ...SITE_STRUCTURED_DATA, "@graph": SITE_STRUCTURED_DATA["@graph"].map(node => ({ ...node, ...(node["@type"] === "Person" ? { name: info.author } : {}), ...(node["@type"] === "Organization" ? {} : { description: seo.description }) })) }
  return (
    // The boot script stamps data-motion before React hydrates.
    // data-scroll-behavior lets the router drop the studio's smooth scrolling
    // while it resets to the top, so a new page doesn't visibly glide up.
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="rgbjoy portfolio as text"
        />
        <link
          rel="alternate"
          type="application/json"
          href="/api/catalog"
          title="rgbjoy public catalog"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
        <meta
          name="impact-site-verification"
          {...{ value: "13d6059a-6a87-4af8-acea-99cfb14cf2ef" }}
        />
        <script
          // Must run before first paint, so it cannot wait for hydration.
          dangerouslySetInnerHTML={{ __html: SETTINGS_BOOT_SCRIPT }}
        />
      </head>
      <body
        className={`${geistMono.variable} ${geistMono.className} ${geistSans.variable} ${plexSans.variable} ${plexMono.variable} ${instrumentSerif.variable}`}
      >
        <PortfolioProvider entries={entries} info={info}>
        <PageTransitions />
        <SearchPalette />
        <RolloverChroma />
        {children}
        </PortfolioProvider>
      </body>
    </html>
  )
}
