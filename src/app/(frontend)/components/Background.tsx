"use client"

import { useEffect, useState } from "react"

import { Canvas } from "@react-three/fiber"
import {
  SoftShadows,
  Float,
  useProgress
} from "@react-three/drei"

import { useTheme } from "@/app/(frontend)/contexts/ThemeContext"
import styles from './Background.module.css'

import { Monstera } from "@/app/(frontend)/components/Monstera"

function ShadowPlane() {
  const { theme } = useTheme()
  const shadowColor = theme === 'dark' ? '#ffffff' : '#000000'
  return (
    <mesh receiveShadow scale={50} position={[0, 0, 0]} rotation={[0, 0.1, 0]}>
      <planeGeometry />
      <shadowMaterial transparent opacity={0.3} color={shadowColor} />
    </mesh>
  )
}

function BackgroundContent() {
  return (
    <>
      <ambientLight intensity={Math.PI / 2} />
      <directionalLight
        castShadow
        position={[5, 5, 30]}
        intensity={1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-15, 15, 15, -15, 1, 50]}
        />
      </directionalLight>

      <Float
        speed={0.3}
        rotationIntensity={0.7}
        floatIntensity={0.2}
      >
        <Monstera position={[2, -4, 10]} rotation={[0, 0, 0]} scale={1.3} />
      </Float>

      <ShadowPlane />
      <SoftShadows size={15} focus={0} samples={32} />
    </>
  )
}

export const Background = () => {
  const { active, progress } = useProgress()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active && progress === 100) {
      // Delay a frame so the first rendered frame isn't visible
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
  }, [active, progress])

  return (
    <div
      className={`${styles.wrapper} ${visible ? styles.visible : ""}`}
      aria-hidden="true"
    >
      <Canvas className={styles.canvas} dpr={0.5} shadows>
        <BackgroundContent />
      </Canvas>
    </div>
  )
}

export default Background