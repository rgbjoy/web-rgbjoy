'use client'

import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'

import styles from './dotsBackground.module.scss'

// Animation constants - adjust these to tweak the noise and speed
const NOISE_AMPLITUDE = 0.18 // Intensity of the wave motion (higher = more movement)
const NOISE_FREQUENCY = 6.0 // Frequency of the wave pattern (higher = more waves)
const ANIMATION_SPEED = 0.65 // Speed of the animation (higher = faster)

const DotsShader = () => {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const { viewport } = useThree()

  const { mesh, material } = useMemo(() => {
    // A simple plane turned into point-vertices, then animated via a shader.
    const width = 2
    const height = 1
    const segments = 22
    const tempGeometry = new THREE.PlaneGeometry(width, height, segments, segments)

    const positionAttr = tempGeometry.attributes.position
    if (!positionAttr) throw new Error('Position attribute not found')
    const positions = positionAttr.array as Float32Array
    const vertexCount = positions.length / 3
    const verticesPerRow = segments + 1
    const horizontalSpacing = width / segments
    const offsetAmount = horizontalSpacing / 2

    const pointPositions: number[] = []
    const pointYNorm: number[] = []
    const pointRandom: number[] = []

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      let x = positions[i3]!
      const y = positions[i3 + 1]!
      const z = positions[i3 + 2]!

      // Determine which row this vertex is in
      const row = Math.floor(i / verticesPerRow)
      // Offset every other row for polkadot pattern
      if (row % 2 === 1) {
        x += offsetAmount
      }

      pointPositions.push(x, y, z)
      // Normalize Y for a subtle top fade (0 bottom → 1 top)
      const yNorm = Math.max(0.0, Math.min(1.0, (y + height / 2) / height))
      pointYNorm.push(yNorm)
      pointRandom.push(Math.random()) // eslint-disable-line
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(pointPositions), 3),
    )
    geometry.setAttribute('yNorm', new THREE.BufferAttribute(new Float32Array(pointYNorm), 1))
    geometry.setAttribute('random', new THREE.BufferAttribute(new Float32Array(pointRandom), 1))

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        amp: { value: NOISE_AMPLITUDE },
        freq: { value: NOISE_FREQUENCY },
        speed: { value: ANIMATION_SPEED },
        color: { value: new THREE.Color('#ffffff') },
        pointSize: { value: 2.0 },
        fadeStart: { value: 0.0 },
        fadeEnd: { value: 1.0 },
        uReveal: { value: 0 },
      },
      vertexShader: `
        precision mediump float;
        attribute float yNorm;
        attribute float random;
        uniform float time;
        uniform float amp;
        uniform float freq;
        uniform float speed;
        uniform float pointSize;
        varying float vYNorm;
        varying float vRandom;
        void main() {
          vec3 pos = position;
          float w1 = sin((pos.x * freq) + time * speed) * amp;
          float w2 = sin((pos.y * freq * 1.3) - time * speed * 0.8) * amp * 0.7;
          pos.z += w1 + w2;
          vYNorm = yNorm;
          vRandom = random;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = pointSize;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform vec3 color;
        uniform float fadeStart;
        uniform float fadeEnd;
        uniform float uReveal;
        varying float vYNorm;
        varying float vRandom;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          // Per-dot ease in based on uReveal
          // vRandom is 0.0-1.0.
          // With uReveal duration of 2s, a window of 0.25 = 0.5s per dot.
          float window = 0.25;
          float individualAlpha = smoothstep(vRandom * (1.0 - window), vRandom * (1.0 - window) + window, uReveal);
          if (individualAlpha <= 0.0) discard;

          float circle = 1.0 - smoothstep(0.3, 0.5, dist);
          float ramp = smoothstep(fadeEnd, fadeStart, vYNorm);
          float alpha = ramp * circle * individualAlpha;
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })

    const mesh = new THREE.Points(geometry, material)
    return { mesh, material }
  }, [])

  useEffect(() => {
    materialRef.current = material
    if (material && material.uniforms.uReveal) {
      gsap.to(material.uniforms.uReveal, {
        value: 1,
        duration: 2,
        ease: 'power2.inOut',
        delay: 0.5,
      })
    }
  }, [material])

  useEffect(() => {
    const group = groupRef.current
    if (!group || !mesh) return
    group.add(mesh)
    return () => {
      if (group && mesh) group.remove(mesh)
    }
  }, [mesh])

  useEffect(() => {
    if (!groupRef.current) return
    groupRef.current.scale.set(viewport.width, viewport.height, 1)
    groupRef.current.position.z = -2
    groupRef.current.renderOrder = -1
  }, [viewport.width, viewport.height])

  useFrame((_, delta) => {
    if (materialRef.current?.uniforms?.time) {
      timeRef.current += delta
      materialRef.current.uniforms.time.value = timeRef.current
    }
  })

  return <group ref={groupRef} />
}

export default function DotsBackground() {
  return (
    <div className={styles.wrapper} aria-hidden="true">
      <Canvas
        className={styles.canvas}
        camera={{ position: [0, 0, 3], fov: 50 }}
        dpr={1}
        gl={{ antialias: false, alpha: true }}
      >
        <DotsShader />
      </Canvas>
    </div>
  )
}
