'use client'

import dynamic from 'next/dynamic'
import styles from './page.module.css'

const HandScene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => (
    <main className={styles.main}>
      <p className={styles.loading} role="status">
        Developing…
      </p>
    </main>
  ),
})

export default function Page() {
  return <HandScene />
}
