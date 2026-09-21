"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Stats } from "@react-three/drei"
import { Color, Fog } from "three"

import { PS2IntroScene } from "./PS2Intro"
import styles from "./page.module.css"

const FOG_COLOR = "#000000"
const STARTUP_AUDIO_SRC = "/startup.mp3"

export default function Page() {
  const containerRef = useRef<HTMLElement>(null)
  const [showStats, setShowStats] = useState(true)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "h" || event.key === "H") {
        setShowStats((visible) => !visible)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    const audio = new Audio(STARTUP_AUDIO_SRC)
    audio.loop = false
    audio.preload = "auto"

    let onInteract: (() => void) | null = null
    const playStartup = () => audio.play()

    void playStartup().catch(() => {
      onInteract = () => {
        void playStartup().catch(() => { })
      }
      window.addEventListener("pointerdown", onInteract, { once: true })
    })

    return () => {
      if (onInteract) window.removeEventListener("pointerdown", onInteract)
      audio.pause()
      audio.src = ""
    }
  }, [])

  return (
    <main ref={containerRef} className={styles.main}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        camera={{
          position: [0, 6.5, 21],
          fov: 80,
          near: 0.1,
          far: 120,
        }}
        gl={{ antialias: true }}
        onCreated={({ scene }) => {
          scene.background = new Color(FOG_COLOR)
          scene.fog = new Fog(FOG_COLOR, 6, 42)
        }}
      >
        <PS2IntroScene />
        <OrbitControls
          target={[0, 3.4, 0]}
          enablePan={false}
          minDistance={6}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2}
        />
        {showStats ? (
          <Stats
            parent={containerRef as RefObject<HTMLElement>}
            className={styles.stats}
          />
        ) : null}
      </Canvas>
    </main>
  )
}
