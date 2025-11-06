import ArtClient from './art.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

export const metadata: Metadata = {
  title: 'Art & Design',
  description:
    'A collection of visual explorations — abstract, human-made, and digital. Each piece studies color, rhythm, and emotion through form and texture.',
}

export default async function Page() {
  const artData = await getCachedGlobal('art', 1)()
  const content_html = artData?.content ? convertLexicalToHTML({ data: artData.content }) : ''

  return <ArtClient {...artData} content_html={content_html} />
}
