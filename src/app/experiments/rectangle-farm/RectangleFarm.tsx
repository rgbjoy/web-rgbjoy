"use client"

import { useFrame } from "@react-three/fiber"
import {
  Environment,
  OrbitControls,
  OrthographicCamera,
  RoundedBoxGeometry,
} from "@react-three/drei"
import { useLayoutEffect, useMemo, useRef } from "react"
import { Color, Quaternion, Vector3 } from "three"
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js"
import type { Group, Mesh, MeshPhysicalMaterial } from "three"

const COLUMNS = 3
const LEVELS = 3
const DEPTH = 3
const RECTANGLE_WIDTH = 0.34
const RECTANGLE_HEIGHT = 1.05
const RECTANGLE_DEPTH = 0.34
const CAMERA_ZOOM = 130
const GAP = 1 / CAMERA_ZOOM
const SPACING_X = RECTANGLE_HEIGHT + GAP
const SPACING_Y = RECTANGLE_HEIGHT + GAP
const SPACING_Z = RECTANGLE_HEIGHT + GAP
const ROTATION_STEP = Math.PI / 2
const ROTATION_DURATION = 0.82
const PAUSE_DURATION = 1.2
const NOISE_SCALE = 0.54

const chromeColor = new Color("#050506")
const plasticColor = new Color("#050506")
const materialColor = new Color()
const localLongAxis = new Vector3(0, 1, 0)
const worldUp = new Vector3(0, 1, 0)
const rotationAxes = [
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
]

type RotationState = {
  from: Quaternion
  to: Quaternion
  current: Quaternion
  nextAt: number
  startedAt: number
  isRotating: boolean
  noiseOffset: number
}

type RectangleCell = {
  x: number
  y: number
  z: number
  noiseX: number
  noiseY: number
  noiseZ: number
}

function makeRectangleCells() {
  const cells: RectangleCell[] = []

  for (let level = 0; level < LEVELS; level += 1) {
    for (let depth = 0; depth < DEPTH; depth += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        cells.push({
          x: (column - (COLUMNS - 1) / 2) * SPACING_X,
          y: (level - (LEVELS - 1) / 2) * SPACING_Y,
          z: (depth - (DEPTH - 1) / 2) * SPACING_Z,
          noiseX: column * NOISE_SCALE,
          noiseY: level * NOISE_SCALE,
          noiseZ: depth * NOISE_SCALE,
        })
      }
    }
  }

  return cells
}

export function RectangleField() {
  const groupRef = useRef<Group>(null)
  const meshRefs = useRef<Array<Mesh | null>>([])
  const materialRefs = useRef<Array<MeshPhysicalMaterial | null>>([])
  const cells = useMemo(() => makeRectangleCells(), [])
  const noise = useMemo(() => new ImprovedNoise(), [])
  const rotationStates = useMemo<RotationState[]>(
    () =>
      cells.map((cell, index) => {
        const initial = new Quaternion()

        return {
          from: initial.clone(),
          to: initial.clone(),
          current: initial.clone(),
          nextAt:
            PAUSE_DURATION +
            Math.abs(noise.noise(cell.noiseX, cell.noiseY, 4)) * 1.4,
          startedAt: 0,
          isRotating: false,
          noiseOffset: index * 0.137,
        }
      }),
    [cells, noise],
  )

  useLayoutEffect(() => {
    cells.forEach((cell, index) => {
      applyCellTransform(meshRefs.current[index], cell, rotationStates[index])
      applyOrientationMaterial(
        materialRefs.current[index],
        rotationStates[index].current,
      )
    })
  }, [cells, rotationStates])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    group.rotation.y += delta * 0.025
    group.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.04

    const elapsed = state.clock.elapsedTime

    cells.forEach((cell, index) => {
      const rotationState = rotationStates[index]

      if (!rotationState.isRotating && elapsed >= rotationState.nextAt) {
        rotationState.from.copy(rotationState.current)
        rotationState.to
          .copy(rotationState.from)
          .multiply(
            makeNoiseQuarterTurn(
              noise,
              cell,
              index,
              elapsed * 0.38 + rotationState.noiseOffset,
            ),
          )
        rotationState.startedAt = elapsed
        rotationState.isRotating = true
      }

      if (rotationState.isRotating) {
        const progress = Math.min(
          1,
          (elapsed - rotationState.startedAt) / ROTATION_DURATION,
        )
        const easedProgress = easeInOutCubic(progress)

        rotationState.current
          .copy(rotationState.from)
          .slerp(rotationState.to, easedProgress)

        if (progress >= 1) {
          rotationState.isRotating = false
          rotationState.current.copy(rotationState.to)
          rotationState.nextAt =
            elapsed +
            PAUSE_DURATION +
            Math.abs(
              noise.noise(
                cell.noiseX + elapsed * 0.13,
                cell.noiseY,
                cell.noiseZ + rotationState.noiseOffset,
              ),
            ) *
            1.35
        }
      }

      applyCellTransform(meshRefs.current[index], cell, rotationState)
      applyOrientationMaterial(
        materialRefs.current[index],
        rotationState.current,
      )
    })
  })

  return (
    <group ref={groupRef}>
      {cells.map((_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            meshRefs.current[index] = mesh
          }}
        >
          <RoundedBoxGeometry
            args={[RECTANGLE_WIDTH, RECTANGLE_HEIGHT, RECTANGLE_DEPTH]}
            radius={0.0075}
            smoothness={4}
            bevelSegments={8}
          />
          <meshPhysicalMaterial
            ref={(material) => {
              materialRefs.current[index] = material
            }}
            color="#050506"
            emissive="#000000"
            emissiveIntensity={0}
            metalness={1}
            roughness={0.18}
            clearcoat={0}
            clearcoatRoughness={0}
            reflectivity={1}
            envMapIntensity={2.2}
          />
        </mesh>
      ))}
    </group>
  )
}

function applyCellTransform(
  mesh: Mesh | null,
  cell: RectangleCell,
  rotationState: RotationState,
) {
  if (!mesh) return

  mesh.position.set(cell.x, cell.y, cell.z)
  mesh.quaternion.copy(rotationState.current)
}

function applyOrientationMaterial(
  material: MeshPhysicalMaterial | null,
  quaternion: Quaternion,
) {
  if (!material) return

  localLongAxis.set(0, 1, 0).applyQuaternion(quaternion)
  const sideAmount = smoothstep(1 - Math.abs(localLongAxis.dot(worldUp)))

  material.color.copy(
    materialColor.lerpColors(chromeColor, plasticColor, sideAmount),
  )
  material.metalness = lerp(1, 0, sideAmount)
  material.roughness = lerp(0.32, 0.22, sideAmount)
  material.clearcoat = sideAmount
  material.clearcoatRoughness = lerp(0, 0.06, sideAmount)
  material.envMapIntensity = lerp(2.2, 1.6, sideAmount)
}

function makeNoiseQuarterTurn(
  noise: ImprovedNoise,
  cell: RectangleCell,
  index: number,
  time: number,
) {
  const axisNoise = noise.noise(cell.noiseX + time, cell.noiseY, cell.noiseZ)
  const directionNoise = noise.noise(
    cell.noiseX + index * 0.19,
    cell.noiseY,
    cell.noiseZ + time + 17.3,
  )
  const normalizedAxisNoise = (axisNoise + 1) / 2
  const axisIndex = Math.min(
    rotationAxes.length - 1,
    Math.max(0, Math.floor(normalizedAxisNoise * rotationAxes.length)),
  )
  const direction = directionNoise >= 0 ? 1 : -1

  return new Quaternion().setFromAxisAngle(
    rotationAxes[axisIndex],
    direction * ROTATION_STEP,
  )
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function smoothstep(value: number) {
  const clamped = Math.min(1, Math.max(0, value))

  return clamped * clamped * (3 - 2 * clamped)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

export function RectangleFarmCanvas() {
  return (
    <>
      <color attach="background" args={["#000000"]} />
      <OrthographicCamera
        makeDefault
        position={[4.2, 4.7, 5.4]}
        zoom={CAMERA_ZOOM}
      />
      <RectangleField />
      <Environment preset="city" />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.35}
        enablePan={false}
        maxPolarAngle={Math.PI / 1}
        minPolarAngle={Math.PI / 4}
      />
    </>
  )
}
