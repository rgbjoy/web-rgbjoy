import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Vector3 } from 'three'

class StarfieldMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: `
          attribute float size;
          attribute vec3 color;
          attribute float opacity; // Custom opacity attribute
          varying vec3 vColor;
          varying float vOpacity;
          void main() {
            vColor = color;
            vOpacity = opacity; // Pass opacity to fragment shader
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
      fragmentShader: `
          varying vec3 vColor;
          varying float vOpacity; // Receive opacity from vertex shader
          void main() {
            gl_FragColor = vec4(vColor, vOpacity); // Use per-particle opacity
          }
        `,
      uniforms: {},
      depthTest: true,
      transparent: true,
    })
  }
}

function getRandomBetween(min = -5, max = 5) {
  return Math.random() * (max - min) + min
}

function Stars({ count = 50, startRadius = 2, canReset = true }) {
  const size = 2
  const distance = 20
  const viewDistance = 10
  const particleSpeed = 0.08
  const fadeSpeed = 0.01
  const minOpacity = 0
  const maxOpacity = 1

  const mesh = useRef<THREE.Points>(null)
  const { positions, colors, sizes, opacity } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const color = new Vector3(1, 1, 1)
    const opacity = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * startRadius
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius
      positions[i * 3 + 2] = getRandomBetween(-distance * 2, -1)
      colors[i * 3] = color.x
      colors[i * 3 + 1] = color.y
      colors[i * 3 + 2] = color.z
      sizes[i] = size
      opacity[i] = minOpacity
    }

    return { positions, colors, sizes, opacity }
  }, [count, startRadius])

  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacity, 1))
    return geometry
  }, [positions, colors, sizes, opacity])

  const material = useMemo(() => new StarfieldMaterial(), [])

  useFrame(() => {
    const geometry = mesh.current?.geometry

    if (!geometry?.attributes?.position || !geometry.attributes.opacity) return

    const positions = geometry.attributes.position.array as Float32Array | undefined
    const opacity = geometry.attributes.opacity.array as Float32Array | undefined

    if (!positions || !opacity) return

    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2]
      if (z === undefined) continue

      positions[i + 2] = z + particleSpeed
      const opacityIndex = i / 3
      let currentOpacity = opacity[opacityIndex] ?? 0

      if (z > -viewDistance && canReset && currentOpacity < maxOpacity) {
        currentOpacity += fadeSpeed
      } else if (!canReset) {
        currentOpacity -= fadeSpeed
      }

      opacity[opacityIndex] = Math.max(minOpacity, Math.min(maxOpacity, currentOpacity))

      if (z >= 5) {
        positions[i + 2] = getRandomBetween(-distance * 2, 0)
        opacity[opacityIndex] = minOpacity
      }
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.opacity.needsUpdate = true
  })

  return (
    <points
      position={[0, 0, 0]}
      ref={mesh as React.RefObject<THREE.Points | null>}
      args={[geometry, material]}
    />
  )
}

export default Stars
