import DevClient from './dev.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const metadata: Metadata = {
  title: 'Development',
  description:
    'Selected development work — from modern CMS architectures and fast, resilient front-ends to experimental WebGL and motion-driven interfaces.',
}

export default async function Page() {
  const devData = await getCachedGlobal('dev', 1)()

  return <DevClient {...devData} />
}
