"use client"

import { useCallback, useState } from "react"

import { GlobalIlluminationCanvas } from "./GlobalIllumination"
import styles from "./page.module.css"

export default function Page() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])

  return (
    <main
      className={styles.main}
      aria-label="A room inside a concrete box floating in the sky, with an orange glowing sphere, a small green sphere and a blue block. Sun streams through a single window in a visible shaft and bounces off the floor and walls, filling the shadows with soft, tinted light. Drag to orbit, scroll to move in and out of the building."
    >
      <div className={styles.stage} style={{ opacity: ready ? 1 : 0 }}>
        <GlobalIlluminationCanvas onReady={onReady} />
      </div>
    </main>
  )
}
