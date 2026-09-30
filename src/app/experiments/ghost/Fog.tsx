'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
} from 'three'

// Bake seamless cloud detail once. Each layer needs only two texture samples
// per fragment instead of recomputing noise or ray marching a volume.
function createNoiseTexture() {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 127
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const noise = (x: number, y: number, cells: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = hash(ix % cells, iy % cells)
    const b = hash((ix + 1) % cells, iy % cells)
    const c = hash(ix % cells, (iy + 1) % cells)
    const d = hash((ix + 1) % cells, (iy + 1) % cells)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0
      let weight = 0.55
      for (let octave = 0; octave < 4; octave++) {
        const cells = 4 * 2 ** octave
        value += noise((x / size) * cells, (y / size) * cells, cells) * weight
        weight *= 0.5
      }
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = Math.round((value / 1.03125) * 255)
      data[i + 3] = 255
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPhase;
  uniform float uOpacity;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // Sampling x - time advects the cloud field to the right. Stretching
    // the field horizontally creates long wisps instead of round smoke blobs.
    vec2 flow = vec2(vWorld.x * 0.14 - uTime * uSpeed,
      vWorld.y * 0.75 + uPhase);
    float broad = texture2D(uNoise, flow).r;
    vec2 curl = vec2(0.0, (broad - 0.5) * 0.24
      + sin(uTime * 0.18 + vWorld.x * 0.45) * 0.035);
    float detail = texture2D(uNoise,
      flow * vec2(1.9, 1.1) + curl + vec2(-uTime * uSpeed * 0.27, uPhase * 0.37)).r;
    // Clear gaps between wisps make their movement visible against the dark
    // stage while the low opacity keeps the character readable.
    float density = smoothstep(0.3, 0.78, broad * 0.6 + detail * 0.4);

    // Fade into the stage and disappear smoothly above the character's hem.
    float height = max(0.0, vWorld.y);
    float falloff = smoothstep(0.025, 0.22, height)
      * exp(-pow(height / uHeight, 2.0) * 1.6);
    float edges = smoothstep(0.0, 0.12, vUv.x)
      * (1.0 - smoothstep(0.88, 1.0, vUv.x))
      * smoothstep(0.0, 0.08, vUv.y)
      * (1.0 - smoothstep(0.78, 1.0, vUv.y));
    float alpha = density * falloff * edges * uOpacity;

    // A broad warm light pool and cooler rim make the drifting wisps read
    // as illuminated haze, without adding lights or rendering shadow maps.
    float pool = exp(-pow((vWorld.x + 0.45) / 2.5, 2.0)
      - pow(vWorld.z / 3.5, 2.0));
    float rim = exp(-pow((vWorld.x - 2.0) / 2.4, 2.0));
    vec3 light = vec3(0.055, 0.075, 0.09)
      + pool * vec3(0.17, 0.16, 0.13)
      + rim * vec3(0.025, 0.045, 0.065);
    gl_FragColor = vec4(light, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function Fog({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<Group>(null)
  const cards = useRef<Mesh[]>([])
  const time = useRef({ value: 0 })
  const { camera } = useThree()

  useEffect(() => {
    const owner = root.current
    if (!owner) return
    const noise = createNoiseTexture()
    const geometry = new PlaneGeometry(1, 1)
    const layers = [
      { y: 0.95, z: -1.2, height: 3.4, mistHeight: 1.65, opacity: 0.48, phase: 0.19, speed: 0.026 },
      { y: 0.43, z: 1.4, height: 2.2, mistHeight: 0.8, opacity: 0.4, phase: 0.83, speed: 0.038 },
    ].map((layer, index) => {
      const material = new ShaderMaterial({
        uniforms: {
          uNoise: { value: noise },
          uTime: time.current,
          uSpeed: { value: layer.speed },
          uPhase: { value: layer.phase },
          uOpacity: { value: layer.opacity },
          uHeight: { value: layer.mistHeight },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      })
      const mesh = new Mesh(geometry, material)
      mesh.position.set(0, layer.y, layer.z)
      mesh.scale.set(13, layer.height, 1)
      mesh.renderOrder = index + 1
      owner.add(mesh)
      return mesh
    })
    cards.current = layers
    return () => {
      cards.current = []
      for (const mesh of layers) {
        owner.remove(mesh)
        ;(mesh.material as ShaderMaterial).dispose()
      }
      geometry.dispose()
      noise.dispose()
    }
  }, [])

  useFrame((_, delta) => {
    if (!reducedMotion) time.current.value += Math.min(delta, 0.05)
    for (const mesh of cards.current) mesh.quaternion.copy(camera.quaternion)
  })

  return <group ref={root} />
}
