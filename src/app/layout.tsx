import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import localFont from "next/font/local"

import { SITE } from "./data/site"
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

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // The boot script stamps data-theme / data-motion before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Must run before first paint, so it cannot wait for hydration.
          dangerouslySetInnerHTML={{ __html: SETTINGS_BOOT_SCRIPT }}
        />
      </head>
      <body
        className={`${geistMono.variable} ${geistMono.className} ${plexSans.variable} ${plexMono.variable} ${redaction.variable}`}
      >
        <SearchPalette />
        <RolloverChroma />
        {children}
      </body>
    </html>
  )
}
