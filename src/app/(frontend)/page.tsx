import { Metadata } from 'next'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Art, Dev, Footer, Home, Info } from '@payload-types'

import PageClient from './page.client'

export const metadata: Metadata = {
  description:
    'Crafting creative, performant web experiences that merge design, technology, and storytelling — making the internet more human.',
}

export default async function Page() {
  const [home, info, dev, art, footer] = await Promise.all([
    getCachedGlobal('home', 1)() as unknown as Home,
    getCachedGlobal('info', 1)() as unknown as Info,
    getCachedGlobal('dev', 1)() as unknown as Dev,
    getCachedGlobal('art', 1)() as unknown as Art,
    getCachedGlobal('footer', 1)() as unknown as Footer,
  ])

  const info_html = info?.content ? convertLexicalToHTML({ data: info.content }) : ''
  const dev_html = dev?.content ? convertLexicalToHTML({ data: dev.content }) : ''
  const art_html = art?.content ? convertLexicalToHTML({ data: art.content }) : ''

  return (
    <PageClient
      home={home}
      info={{ ...info, content_html: info_html }}
      dev={{ ...dev, content_html: dev_html }}
      art={{ ...art, content_html: art_html }}
      footer={footer}
    />
  )
}
