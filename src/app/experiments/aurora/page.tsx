"use client"

import { ShaderAuroraCanvas } from "./AuroraBackground"

import styles from "./page.module.css"

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderAuroraCanvas />
    </main>
  )
}
