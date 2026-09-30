'use client'

import dynamic from 'next/dynamic'
import styles from './page.module.css'

const GhostScene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => (
    <main className={styles.main}>
      <p className={styles.loading} role="status">
        A presence is taking shape…
      </p>
    </main>
  ),
})

export default function Page() {
  return <GhostScene />
}
