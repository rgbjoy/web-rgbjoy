import DevClient from './dev.client'
import { Metadata } from 'next'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const metadata: Metadata = {
  title: 'Development',
  description: 'Multidisciplinary digital creator & software engineer',
}

export default async function Page() {
  const devData = await getCachedGlobal('dev', 1)()

  return <DevClient {...devData} />
}
