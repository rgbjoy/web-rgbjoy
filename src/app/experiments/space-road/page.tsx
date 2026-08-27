"use client"

import { Canvas } from "@react-three/fiber"
import { Vector3 } from "three"

import { SpaceRoadScene } from "./SpaceRoad"
import styles from "./page.module.css"

const lookTarget = new Vector3(0, -0.45, -30)

export default function Page() {
  return (
    <main className={styles.main}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        camera={{
          position: [0, -0.35, 4.2],
          fov: 58,
          near: 0.1,
          far: 80,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(lookTarget)
        }}
        gl={{ antialias: true }}
      >
        <SpaceRoadScene />
      </Canvas>
    </main>
  )
}
