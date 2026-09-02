"use client"

import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useFrame } from "@react-three/fiber"
import { Environment, MeshTransmissionMaterial, Trail, useTexture } from "@react-three/drei"

import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Color,
  InstancedMesh,
  Object3D,
  RepeatWrapping,
} from "three"
import type { Group, Mesh } from "three"

import { applyHeightFogShader } from "./heightFog"
import { NoiseCloud } from "./NoiseCloud"
import { fbm2 } from "./perlin2d"
import { applyBoxWorldMapShader } from "./boxWorldMap"

// --- Grid of concrete columns -------------------------------------------

const GRID_COLS = 9
const GRID_ROWS = 14
const SPACING = 1.4
const COLUMN_WIDTH = 1
const COLUMN_DEPTH = 1
const MIN_HEIGHT = 1.4
const MAX_HEIGHT = 4.6

const GRID_WIDTH = (GRID_COLS - 1) * SPACING
const GRID_DEPTH = (GRID_ROWS - 1) * SPACING
/** Perlin scale — lower = larger rectangular void regions. */
const VOID_NOISE_SCALE = 0.9
/** Cells with fbm below this are left empty. */
const VOID_THRESHOLD = 0.4
const SHADE_MIN = 0.5
const SHADE_MAX = 1.0
const FOG_HEIGHT = 2.5
const FOG_BOUNDS_PADDING = SPACING * 3
const CLOUD_BOUNDS_PADDING = SPACING * 5
const CLOUD_Y = 0.45
const CLOUD_OPACITY = 0.38
const CONCRETE_TEXTURE = "/concrete.jpg"
const CONCRETE_TILE = 0.45
const ENV_PRESET = "city" as const

const heightFogOptions = {
  fogHeight: FOG_HEIGHT,
  fogInnerHalfWidth: GRID_WIDTH / 2,
  fogInnerHalfDepth: GRID_DEPTH / 2,
  fogHalfWidth: GRID_WIDTH / 2 + FOG_BOUNDS_PADDING,
  fogHalfDepth: GRID_DEPTH / 2 + FOG_BOUNDS_PADDING,
  distanceFogStrength: 0.22,
} as const

// Seeded pseudo-random — one seed per page load, stable within the session.
function seededRandom(seed: number) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

type Column = {
  x: number
  z: number
  height: number
  shade: number
  phase: number
  pulseSpeed: number
}

function makeColumns(seed: number): Column[] {
  const rng = seededRandom(seed)
  const noiseOffsetX = rng() * 200
  const noiseOffsetY = rng() * 200
  const columns: Column[] = []

  for (let col = 0; col < GRID_COLS; col += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const gridNoise = fbm2(
        col * VOID_NOISE_SCALE + noiseOffsetX,
        row * VOID_NOISE_SCALE + noiseOffsetY,
      )
      if (gridNoise < VOID_THRESHOLD) continue

      const x = col * SPACING - GRID_WIDTH / 2
      const z = row * SPACING - GRID_DEPTH / 2
      const height = MIN_HEIGHT + rng() * (MAX_HEIGHT - MIN_HEIGHT)
      const shade =
        SHADE_MIN +
        ((gridNoise - VOID_THRESHOLD) / (1 - VOID_THRESHOLD)) *
        (SHADE_MAX - SHADE_MIN)
      const phase = rng() * Math.PI * 2
      const pulseSpeed = 0.05 + rng() * 0.08
      columns.push({ x, z, height, shade, phase, pulseSpeed })
    }
  }

  return columns
}

const dummy = new Object3D()
const shadeColor = new Color()

// How much each column's height swells and shrinks, as a fraction of its
// base height.
const PULSE_AMOUNT = 0.45

function ConcreteColumns() {
  const meshRef = useRef<InstancedMesh>(null)
  const concreteMap = useTexture(CONCRETE_TEXTURE, (map) => {
    map.wrapS = RepeatWrapping
    map.wrapT = RepeatWrapping
  })
  const [columns] = useState(() =>
    makeColumns((Math.random() * 0x7fffffff) | 0),
  )
  const columnCount = columns.length
  const onBeforeCompile = useMemo(
    () => (shader: Parameters<typeof applyHeightFogShader>[0]) => {
      applyBoxWorldMapShader(shader, CONCRETE_TILE)
      applyHeightFogShader(shader, heightFogOptions)
    },
    [],
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    columns.forEach((column, index) => {
      shadeColor.setRGB(column.shade, column.shade, column.shade)
      mesh.setColorAt(index, shadeColor)
    })

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [columns])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    const time = state.elapsed
    dummy.rotation.set(0, 0, 0)

    columns.forEach((column, index) => {
      const pulse = Math.sin(time * column.pulseSpeed + column.phase)
      const height = column.height * (1 + pulse * PULSE_AMOUNT)
      dummy.position.set(column.x, height / 2, column.z)
      dummy.scale.set(COLUMN_WIDTH, height, COLUMN_DEPTH)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, columnCount]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={concreteMap}
        color="#ffffff"
        metalness={0.08}
        roughness={0.82}
        envMapIntensity={0.35}
        fog
        onBeforeCompile={onBeforeCompile}
        customProgramCacheKey={() => "ps2-column-height-fog-v8-box-uv"}
      />
    </instancedMesh>
  )
}

// --- Refracting glass cubes ---------------------------------------------

type CubeConfig = {
  position: [number, number, number]
  size: number
  spinSpeed: number
  tilt: number
}

const CUBES: CubeConfig[] = [
  { position: [-4.6, 7.4, -3.2], size: 1.5, spinSpeed: 0.18, tilt: 0.4 },
  { position: [3.8, 8.6, 2.6], size: 1.8, spinSpeed: -0.14, tilt: 0.9 },
  { position: [0.2, 7.0, -5.4], size: 1.3, spinSpeed: 0.22, tilt: 0.2 },
  { position: [5.2, 7.8, -1.0], size: 1.45, spinSpeed: -0.2, tilt: 1.3 },
  { position: [-3.0, 9.0, 4.0], size: 1.65, spinSpeed: 0.16, tilt: 0.7 },
]

function GlassCube({ config }: { config: CubeConfig }) {
  const ref = useRef<Mesh>(null)

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.rotation.y += config.spinSpeed * delta
    mesh.rotation.x += config.spinSpeed * 0.4 * delta
  })

  return (
    <mesh
      ref={ref}
      position={config.position}
      rotation={[config.tilt, config.tilt * 0.5, 0]}
    >
      <boxGeometry args={[config.size, config.size, config.size]} />
      <MeshTransmissionMaterial
        color="#ffffff"
        transmission={1}
        thickness={0.35}
        roughness={0.06}
        ior={1.45}
        chromaticAberration={0.04}
        anisotropy={0.1}
        distortion={0.15}
        distortionScale={0.3}
        temporalDistortion={0.1}
        attenuationColor="#ffffff"
        attenuationDistance={5}
        samples={8}
        resolution={512}
      />
    </mesh>
  )
}

// --- Whirling colored lights with trails ---------------------------------

type LightConfig = {
  color: string
  radius: number
  height: number
  speed: number
  phase: number
  wobble: number
}

const LIGHTS: LightConfig[] = [
  { color: "#ff2d4b", radius: 5.6, height: 4.4, speed: 0.2, phase: 0.0, wobble: 1.1 },
  { color: "#ff9a1f", radius: 4.4, height: 5.2, speed: -0.26, phase: 1.9, wobble: 0.8 },
  { color: "#37e06b", radius: 6.2, height: 4.0, speed: 0.167, phase: 3.6, wobble: 1.4 },
  { color: "#9b5cff", radius: 5.0, height: 5.6, speed: -0.22, phase: 5.1, wobble: 1.0 },
]

function WhirlingLight({ config }: { config: LightConfig }) {
  const ref = useRef<Group>(null)
  // HDR-boosted color so the orb blooms like the trail instead of relying on
  // a fake halo sprite.
  const orbColor = useMemo(
    () => new Color(config.color).multiplyScalar(6),
    [config.color],
  )

  useFrame((state) => {
    const group = ref.current
    if (!group) return
    const t = state.elapsed * config.speed + config.phase
    group.position.set(
      Math.cos(t) * config.radius + Math.sin(t * 1.7) * config.wobble,
      config.height + Math.sin(t * 2.3) * config.wobble,
      Math.sin(t) * (config.radius * 0.8) + Math.cos(t * 1.3) * config.wobble,
    )
  })

  return (
    <Trail
      width={1.5}
      length={24}
      color={config.color}
      decay={1.1}
      attenuation={(w) => w * w}
    >
      <group ref={ref}>
        <pointLight
          color={config.color}
          intensity={28}
          distance={16}
          decay={2}
        />
        <mesh>
          <sphereGeometry args={[0.04, 24, 24]} />
          <meshBasicMaterial color={orbColor} toneMapped={false} />
        </mesh>
      </group>
    </Trail>
  )
}

// --- Scene ---------------------------------------------------------------

export function PS2IntroScene() {
  return (
    <>
      {/* Night-city HDR for reflections/refractions; backdrop stays black. */}
      <Suspense fallback={null}>
        <Environment preset={ENV_PRESET} background={false} />
      </Suspense>

      <Suspense fallback={null}>
        <ConcreteColumns />
      </Suspense>

      <NoiseCloud
        width={GRID_WIDTH + CLOUD_BOUNDS_PADDING * 2}
        depth={GRID_DEPTH + CLOUD_BOUNDS_PADDING * 2}
        y={CLOUD_Y}
        opacity={CLOUD_OPACITY}
        innerHalfWidth={GRID_WIDTH / 2}
        outerHalfWidth={GRID_WIDTH / 2 + CLOUD_BOUNDS_PADDING}
        innerHalfDepth={GRID_DEPTH / 2}
        outerHalfDepth={GRID_DEPTH / 2 + CLOUD_BOUNDS_PADDING}
      />

      {CUBES.map((config, index) => (
        <GlassCube key={index} config={config} />
      ))}

      {LIGHTS.map((config, index) => (
        <WhirlingLight key={index} config={config} />
      ))}

      <Suspense fallback={null}>
        <EffectComposer multisampling={4}>
          <Bloom
            intensity={1.1}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.5}
            mipmapBlur
          />
        </EffectComposer>
      </Suspense>
    </>
  )
}
