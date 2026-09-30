'use client'

import { ScreenQuad, shaderMaterial } from '@react-three/drei/legacy'
import { Canvas, extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { ShaderMaterial, Vector2 } from 'three'

import { useReducedMotion } from '../../utilities/settings/useSettings'
import vertexShader from '../../utilities/shaders/gradient.vert'
import fragmentShader from './glassGrid.frag'
import styles from './GlassGridBackground.module.css'

type Uniforms = {
  uTime: number
  uAspectRatio: number
  uPointer: Vector2
}

const GlassGridMaterial = shaderMaterial(
  { uTime: 0, uAspectRatio: 1, uPointer: new Vector2() },
  vertexShader,
  fragmentShader,
)

extend({ GlassGridMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    glassGridMaterial: import('@react-three/fiber').ThreeElements['shaderMaterial'] &
      Partial<Uniforms>
  }
}

function ShaderGlassGrid() {
  const materialRef = useRef<ShaderMaterial & Uniforms>(null)
  const reducedMotion = useReducedMotion()

  useFrame(({ size, pointer }, delta) => {
    const material = materialRef.current
    if (!material) return
    const dt = Math.min(delta, 0.05)
    material.uAspectRatio = size.width / size.height
    if (!reducedMotion) material.uTime += dt
    const ease = 1 - Math.exp(-dt * 2.5)
    material.uPointer.x += ((reducedMotion ? 0 : pointer.x) - material.uPointer.x) * ease
    material.uPointer.y += ((reducedMotion ? 0 : pointer.y) - material.uPointer.y) * ease
  })

  return (
    <ScreenQuad>
      <glassGridMaterial
        key={GlassGridMaterial.key}
        ref={materialRef}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

export function ShaderGlassGridCanvas() {
  return (
    <Canvas
      className={styles.canvas}
      dpr={[1, 1.25]}
      gl={{ alpha: false, antialias: false }}
      style={{ background: '#080905' }}
    >
      <ShaderGlassGrid />
    </Canvas>
  )
}
