import 'normalize.css/normalize.css'
import './styles/global.scss'

import { Viewport, Metadata } from 'next'

import { Montserrat } from 'next/font/google'
import localFont from 'next/font/local'

import SiteLayout from './siteLayout'
import { use } from 'react'
import { getPayload } from 'payload'
import { headers as nextHeaders } from 'next/headers'
import configPromise from '@payload-config'

import { getCachedGlobal } from '@/utilities/getGlobals'
import { GoogleAnalytics } from '@next/third-parties/google'

const montserrat = Montserrat({ subsets: ['latin'] })
const myFont = localFont({
  src: '../../../public/fonts/Rhode-Regular.woff2',
  variable: '--rhode-font',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://rgbjoy.com'),
  icons: {
    icon: '/social/icon.png',
  },
  openGraph: {
    description: 'Multidisciplinary digital creator & software engineer',
    url: 'https://rgbjoy.com',
    siteName: 'RGBJOY',
    images: [
      {
        url: '/social/opengraph-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    creator: '@rgbjoy',
    images: [
      {
        url: '/social/opengraph-image.png',
        width: 1200,
        height: 630,
      },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: 'black',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const getData = async () => {
    const payload = await getPayload({ config: configPromise })

    const headers = await nextHeaders()
    const { user } = await payload.auth({ headers })

    const [posts, footer, home] = await Promise.all([
      payload.find({
        collection: 'posts',
        depth: 1,
        limit: 12,
        where: {
          _status: { equals: 'published' },
        },
      }),
      getCachedGlobal('footer', 1)(),
      getCachedGlobal('home', 1)(),
    ])

    return { posts, footer, home, user }
  }

  const { posts: postsData, footer: footerData, home: homeData, user } = use(getData())

  return (
    <html lang="en">
      <body className={`${montserrat.className} ${myFont.variable}`}>
        <SiteLayout isAdmin={user} footerData={footerData} postsData={postsData}>
          {children}
        </SiteLayout>
        <GoogleAnalytics gaId="G-Y8MFXEHKYX" />
      </body>
    </html>
  )
}
