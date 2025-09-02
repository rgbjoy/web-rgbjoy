import { Metadata } from 'next'
import HomeClient from './home/home.client'

export const metadata: Metadata = {
  title: 'Tom Fletcher',
  description: 'Multidisciplinary digital creator & software engineer',
}

export default async function Page() {
  return <HomeClient />
}
