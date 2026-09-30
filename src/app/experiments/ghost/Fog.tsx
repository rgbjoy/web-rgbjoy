'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  DataTexture,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
} from 'three'
import { GHOST_QUALITY, type GhostQuality } from './quality'

// Bake seamless cloud detail once. Each layer needs only two texture samples
// per fragment instead of recomputing noise or ray marching a volume.
function createNoiseTexture(size: number) {
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
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    // Just a few centimetres of lift keep the shallow sheets from looking rigid.
    world.y += sin(world.x * 0.55 - uTime * 0.18 + uPhase) * 0.035
      + sin(world.z * 0.9 + world.x * 0.35 - uTime * 0.12) * 0.018;
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
  uniform float uIllumination;
  uniform float uHalfWidth;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // Sampling x - time advects the cloud field to the right. Stretching
    // the field horizontally creates long wisps instead of round smoke blobs.
    vec2 flow = vec2(vWorld.x * 0.14 - uTime * uSpeed,
      vWorld.z * 0.28 + uPhase);
    float broad = texture2D(uNoise, flow).r;
    #if GHOST_MOBILE == 1
      float density = smoothstep(0.3, 0.78, broad);
    #else
    vec2 curl = vec2(0.0, (broad - 0.5) * 0.24
      + sin(uTime * 0.18 + vWorld.x * 0.45) * 0.035);
    float detail = texture2D(uNoise,
      flow * vec2(1.9, 1.1) + curl + vec2(-uTime * uSpeed * 0.27, uPhase * 0.37)).r;
    // Clear gaps between wisps make their movement visible against the dark
    // stage while the low opacity keeps the character readable.
    float density = smoothstep(0.3, 0.78, broad * 0.6 + detail * 0.4);
    #endif

    // A broad footprint fades away both behind the ghost and toward the camera.
    float depth = smoothstep(-4.2, -1.2, vWorld.z)
      * (1.0 - smoothstep(0.9, 4.4, vWorld.z));
    float edges = smoothstep(0.0, 0.12, vUv.x)
      * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    // Taper within the visible view, rather than beyond the wide cards.
    float sides = 1.0 - smoothstep(0.32, 0.97, abs(vWorld.x) / uHalfWidth);
    // Faint stacked slices fade out with altitude instead of cutting a solid
    // horizontal band into the cloth where a single sheet intersects it.
    float altitude = 1.0 - smoothstep(0.25, 0.75, vWorld.y);
    float alpha = density * depth * edges * sides * altitude * uOpacity;

    // Luminous white wisps retain a faint warm pool and cool rim tint.
    #if GHOST_MOBILE == 1
      vec3 light = vec3(0.9, 0.91, 0.92);
    #else
    float pool = exp(-pow((vWorld.x + 0.45) / 2.5, 2.0)
      - pow(vWorld.z / 3.5, 2.0));
    float rim = exp(-pow((vWorld.x - 2.0) / 2.4, 2.0));
    vec3 light = vec3(0.72, 0.74, 0.76)
      + pool * vec3(0.3, 0.29, 0.27)
      + rim * vec3(0.04, 0.055, 0.075);
    #endif
    gl_FragColor = vec4(light * uIllumination, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function Fog({
  quality,
  reducedMotion,
}: {
  quality: GhostQuality
  reducedMotion: boolean
}) {
  const root = useRef<Group>(null)
  const cards = useRef<InstancedMesh[]>([])
  const time = useRef({ value: 0 })
  const halfWidths = useRef([{ value: 4.4 }, { value: 4.4 }])
  const view = useRef({ width: 0, height: 0, depth: 0 })
  const { camera } = useThree()

  useEffect(() => {
    const owner = root.current
    if (!owner) return
    const settings = GHOST_QUALITY[quality]
    const noise = createNoiseTexture(settings.noiseSize)
    const geometry = new PlaneGeometry(1, 1, ...settings.fogSegments).rotateX(-Math.PI / 2)
    // Fewer slices also reduce transparent overdraw, not just draw calls.
    const slices = settings.fogSlices
    const transform = new Matrix4()
    const layers = [
      {
        y: 0.1,
        thickness: 0.32,
        z: -0.15,
        depth: 10,
        illumination: 1,
        opacity: 0.24,
        phase: 0.19,
        speed: 0.026,
      },
      // A second shallow layer crosses the hem without climbing the body.
      {
        y: 0.28,
        thickness: 0.46,
        z: 0.1,
        depth: 9,
        illumination: 0.95,
        opacity: 0.28,
        phase: 0.83,
        speed: 0.038,
      },
    ].map((layer, index) => {
      const material = new ShaderMaterial({
        defines: { GHOST_MOBILE: quality === 'mobile' ? 1 : 0 },
        uniforms: {
          uNoise: { value: noise },
          uTime: time.current,
          uSpeed: { value: layer.speed },
          uPhase: { value: layer.phase },
          uOpacity: { value: layer.opacity / slices },
          uIllumination: { value: layer.illumination },
          uHalfWidth: halfWidths.current[index],
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      })
      const mesh = new InstancedMesh(geometry, material, slices)
      mesh.position.set(0, layer.y, layer.z)
      for (let slice = 0; slice < slices; slice++) {
        transform.makeScale(13, 1, layer.depth)
        transform.setPosition(0, ((slice + 0.5) / slices) * layer.thickness, 0)
        mesh.setMatrixAt(slice, transform)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.renderOrder = index + 1
      owner.add(mesh)
      return mesh
    })
    cards.current = layers
    view.current.width = 0
    return () => {
      cards.current = []
      for (const mesh of layers) {
        owner.remove(mesh)
        ;(mesh.material as ShaderMaterial).dispose()
        mesh.dispose()
      }
      geometry.dispose()
      noise.dispose()
    }
  }, [quality])

  useFrame(({ size, viewport }, delta) => {
    if (!reducedMotion) time.current.value += Math.min(delta, 0.05)
    const previous = view.current
    if (
      previous.width !== size.width ||
      previous.height !== size.height ||
      previous.depth !== camera.position.z
    ) {
      for (let index = 0; index < cards.current.length; index++) {
        halfWidths.current[index].value =
          viewport.getCurrentViewport(camera, cards.current[index].position).width / 2
      }
      previous.width = size.width
      previous.height = size.height
      previous.depth = camera.position.z
    }
  })

  return <group ref={root} />
}
