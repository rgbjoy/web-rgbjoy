"use client"

import { Canvas } from "@react-three/fiber"

import { GradientFlowScene } from "./GradientFlow"
import styles from "./page.module.css"

export default function Page() {
  return (
    <main className={styles.main}>
      <Canvas className={styles.canvas} dpr={[1, 1.5]} gl={{ antialias: false }}>
        <GradientFlowScene />
      </Canvas>
    </main>
  )
}
