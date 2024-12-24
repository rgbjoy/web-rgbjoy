import InfoClient from './info.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'
import type { Info } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Info',
  description: 'Multidisciplinary digital creator & software engineer',
}

export default async function Page() {
  const infoData = await getCachedGlobal('info', 1)()

  return <InfoClient {...(infoData as Info)} />
}
