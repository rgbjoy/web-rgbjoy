"use client"

import { useCallback, useState } from "react"

import { FrostedGlassCanvas } from "./FrostedGlass"
import styles from "./page.module.css"

export default function Page() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])

  return (
    <main className={styles.main}>
      <div className={styles.stage} style={{ opacity: ready ? 1 : 0 }}>
        <FrostedGlassCanvas onReady={onReady} />
      </div>
    </main>
  )
}
