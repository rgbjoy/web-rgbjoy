import InfoClient from './info.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Info } from '@/payload-types'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

export const metadata: Metadata = {
  title: 'Info',
  description:
    'I’m Tom Fletcher, a full-stack engineer and creative technologist from Florida. I build interactive sites and visual systems that feel alive — blending code, motion, and design craft. When I’m not developing, I’m usually surfing or making art with my family.',
}

export default async function Page() {
  const infoData = (await getCachedGlobal('info', 1)()) as Info
  const content_html = infoData?.content ? convertLexicalToHTML({ data: infoData.content }) : ''

  return <InfoClient {...infoData} content_html={content_html} />
}
