import DevClient from './dev.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Dev } from '@payload-types'

export const metadata: Metadata = {
  title: 'Development',
  description:
    'Selected development work — from modern CMS architectures and fast, resilient front-ends to experimental WebGL and motion-driven interfaces.',
}

export default async function Page() {
  const devData = (await getCachedGlobal('dev', 1)()) as Dev
  const content_html = devData?.content ? convertLexicalToHTML({ data: devData.content }) : ''

  return <DevClient {...devData} content_html={content_html} />
}
