import { env } from "cloudflare:workers"
import { mediaUrl } from "./data/media"
import { getPublicCatalog, getSeo, getInfo, getSettings } from "./server/content"
import { PortfolioProvider } from "./utilities/PortfolioProvider"
import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import localFont from "next/font/local"

import { SITE } from "./data/site"
import { serializeJsonLd, SITE_STRUCTURED_DATA } from "./data/structured-data"
import { RolloverChroma } from "./utilities/RolloverChroma"
import { SETTINGS_BOOT_SCRIPT } from "./utilities/settings/constants"
import SearchPalette from "./utilities/SearchPalette/SearchPalette"
import "./globals.css"

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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

/* Display face for the masthead only. The file is the italic cut and the only
   one in the family, so it is declared upright: asking for a normal style from
   a family that has none invites a synthesised upright on some engines. */
const redaction = localFont({
  src: "./fonts/Redaction35-Italic.woff2",
  variable: "--font-redaction",
  display: "swap",
  weight: "400",
})

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
  const info = await getInfo()
  const media = (await getSettings()).media
  const icon = media.find(image => image.kind === 'icon')
  const social = media.find(image => image.kind === 'social')
  const images = social ? [{ url: new URL(mediaUrl(social.version, 'social-1200.png'), env.MEDIA_PUBLIC_URL).href, width: 1200, height: 630, alt: seo.title }] : undefined
  return {
    ...defaultMetadata, ...seo,
    authors: [{ name: info.author, url: SITE.url }], creator: info.author,
    icons: icon ? {
      icon: [{ url: mediaUrl(icon.version, 'icon-32.png'), sizes: '32x32', type: 'image/png' }, { url: mediaUrl(icon.version, 'icon-512.png'), sizes: '512x512', type: 'image/png' }],
      apple: [{ url: mediaUrl(icon.version, 'apple-180.png'), sizes: '180x180', type: 'image/png' }],
    } : { icon: '/default-favicon.ico', apple: '/default-icon.png' },
    openGraph: { ...defaultMetadata.openGraph, ...seo, images },
    twitter: { ...defaultMetadata.twitter, ...seo, card: social ? 'summary_large_image' : 'summary', images: images?.map(image => image.url) },
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
  const structuredData = { ...SITE_STRUCTURED_DATA, "@graph": SITE_STRUCTURED_DATA["@graph"].map(node => ({ ...node, ...(node["@type"] === "Person" ? { name: info.author } : {}), description: seo.description })) }
  return (
    // The boot script stamps data-theme / data-motion before React hydrates.
    <html lang="en" suppressHydrationWarning>
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
        className={`${geistMono.variable} ${geistMono.className} ${plexSans.variable} ${plexMono.variable} ${redaction.variable}`}
      >
        <PortfolioProvider entries={entries} info={info}>
        <SearchPalette />
        <RolloverChroma />
        {children}
        </PortfolioProvider>
      </body>
    </html>
  )
}
