import 'normalize.css/normalize.css'
import './styles/global.scss'

import { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'

import { Montserrat } from 'next/font/google'
import localFont from 'next/font/local'

import GlobalClient from '@/components/GlobalClient'
import { use } from 'react'
import { getPayload } from 'payload'
import { headers as nextHeaders } from 'next/headers'
import configPromise from '@payload-config'

const montserrat = Montserrat({ subsets: ['latin'] })
const myFont = localFont({
  src: '../../../public/fonts/Rhode-Regular.woff2',
  variable: '--rhode-font',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://rgbjoy.com'),
  title: {
    template: '%s | RGBJOY',
    default: 'RGBJOY',
  },
  icons: {
    icon: '/social/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#000000' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const getData = async () => {
    const payload = await getPayload({ config: configPromise })

    const headers = await nextHeaders()
    const { user } = await payload.auth({ headers })

    return { user }
  }

  const { user } = use(getData())

  return (
    <html lang="en">
      <body className={`${montserrat.className} ${myFont.variable}`}>
        {children}
        <GlobalClient isAdmin={!!user} />
        <Analytics />
      </body>
    </html>
  )
}
