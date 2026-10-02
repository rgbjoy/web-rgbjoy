'use client'

import { ScreenQuad, shaderMaterial } from '@react-three/drei/legacy'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { ShaderMaterial, Vector2 } from 'three'

import { useReducedMotion } from '../../utilities/settings/useSettings'
import vertexShader from '../../utilities/shaders/gradient.vert'
import fragmentShader from './glassGrid.frag'
import styles from './GlassGridBackground.module.css'

type Uniforms = {
  uTime: number
  uAspectRatio: number
  uPointer: Vector2
  uCursor: Vector2
  uCursorAlpha: number
  uResolution: Vector2
}

const GlassGridMaterial = shaderMaterial(
  {
    uTime: 0,
    uAspectRatio: 1,
    uPointer: new Vector2(),
    uCursor: new Vector2(0.5, 0.5),
    uCursorAlpha: 0,
    uResolution: new Vector2(1, 1),
  },
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

/** The pointer in uv (0…1, y up), plus whether it is over the page. */
type Cursor = { x: number; y: number; active: boolean }

function ShaderGlassGrid() {
  const materialRef = useRef<ShaderMaterial & Uniforms>(null)
  const reducedMotion = useReducedMotion()
  const { gl } = useThree()
  const cursor = useRef<Cursor>({ x: 0.5, y: 0.5, active: false })

  // The system cursor is hidden over the glass; the shader draws one behind the ribs.
  useEffect(() => {
    const canvas = gl.domElement
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      cursor.current = {
        x: (event.clientX - bounds.left) / bounds.width,
        y: 1 - (event.clientY - bounds.top) / bounds.height,
        active: true,
      }
    }
    const leave = () => {
      cursor.current.active = false
    }
    // A finger only "points" while it is down.
    const lift = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') leave()
    }
    const root = document.documentElement
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', move)
    window.addEventListener('pointerup', lift)
    window.addEventListener('pointercancel', leave)
    window.addEventListener('blur', leave)
    root.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
      window.removeEventListener('pointerup', lift)
      window.removeEventListener('pointercancel', leave)
      window.removeEventListener('blur', leave)
      root.removeEventListener('pointerleave', leave)
    }
  }, [gl])

  useFrame(({ size, pointer }, delta) => {
    const material = materialRef.current
    if (!material) return
    const dt = Math.min(delta, 0.05)
    material.uAspectRatio = size.width / size.height
    material.uResolution.set(size.width, size.height)
    // The cursor is the real pointer, so it tracks exactly; only its fade eases.
    const { x, y, active } = cursor.current
    material.uCursor.set(x, y)
    material.uCursorAlpha += ((active ? 1 : 0) - material.uCursorAlpha) * (1 - Math.exp(-dt * 12))
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
