import 'normalize.css/normalize.css'
import './styles/global.scss'

import { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'

import { IBM_Plex_Mono } from 'next/font/google'
import localFont from 'next/font/local'

import TerminalOverlay from '@/components/TerminalOverlay'
import { ThemeProvider } from './contexts/ThemeContext'
import ThemeToggle from './components/ThemeToggle'

const montserrat = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
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
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
              })();
            `,
          }}
        />
      </head>
      <body className={`${montserrat.className} ${myFont.variable}`}>
        <ThemeProvider>
          {children}
          <ThemeToggle />
          <TerminalOverlay />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
