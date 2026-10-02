import type { Metadata } from 'next'

import { EndlessScroll } from './EndlessScroll'

export const metadata: Metadata = {
  title: 'Endless Scroll — rgbjoy',
  description:
    'An endless vertical list of names with fast, smooth scrolling and paired background and preview colors that crossfade on hover.',
}

export default function Page() {
  return <EndlessScroll />
}
