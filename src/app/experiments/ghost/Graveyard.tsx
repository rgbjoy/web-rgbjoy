'use client'

import { useEffect, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'

type Stone = { matrix: Matrix4; color: Color }

// One shared, chipped block forms the crosses, dry-stone wall, and fallen masonry.
function createStoneGeometry() {
  const geometry = new BoxGeometry(1, 1, 1, 2, 2, 2)
  const positions = geometry.attributes.position
  const point = new Vector3()
  const core = new Vector3()
  const bevel = new Vector3()
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i)
    core.copy(point).clampScalar(-0.42, 0.42)
    bevel.subVectors(point, core).normalize().multiplyScalar(0.08)
    point.copy(core).add(bevel)
    const weathering = 1 - Math.abs(Math.sin(point.x * 17 + point.y * 11 + point.z * 23)) * 0.045
    point.multiplyScalar(weathering)
    positions.setXYZ(i, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

const graves = [
  { x: -1.65, z: -2.3, height: 1.12, yaw: 0.16, lean: -0.07 },
  { x: 1.48, z: -2.65, height: 0.94, yaw: -0.22, lean: 0.09 },
  { x: -2.95, z: -4.05, height: 1.3, yaw: 0.28, lean: 0.04 },
  { x: 0.92, z: -4.8, height: 1.04, yaw: -0.08, lean: -0.1 },
  { x: -0.76, z: -5.15, height: 0.85, yaw: -0.36, lean: 0.12 },
] as const

const walls = [
  { from: [-4.1, -5.0], to: [-1.15, -5.0], columns: 6, phase: 0 },
  { from: [1.0, -5.55], to: [4.1, -5.35], columns: 6, phase: 2 },
  { from: [-4.1, -4.85], to: [-3.7, -1.6], columns: 7, phase: 1 },
  { from: [4.05, -5.15], to: [3.65, -2.15], columns: 6, phase: 3 },
] as const

export default function Graveyard({ compact }: { compact: boolean }) {
  const root = useRef<Group>(null)

  useEffect(() => {
    const owner = root.current
    if (!owner) return
    const stones: Stone[] = []
    const local = new Object3D()
    const grave = new Object3D()
    const addStone = (
      position: [number, number, number],
      scale: [number, number, number],
      rotation: [number, number, number],
      tint: string,
      parent?: Matrix4,
    ) => {
      local.position.fromArray(position)
      local.scale.fromArray(scale)
      local.rotation.fromArray([...rotation, 'YXZ'])
      local.updateMatrix()
      const matrix = local.matrix.clone()
      if (parent) matrix.premultiply(parent)
      stones.push({ matrix, color: new Color(tint) })
    }

    for (const [index, marker] of graves.entries()) {
      grave.position.set(marker.x * (compact && index > 1 ? 0.8 : 1), 0, marker.z)
      grave.rotation.set(0.025, marker.yaw, marker.lean, 'YXZ')
      grave.scale.setScalar(1)
      grave.updateMatrix()
      const height = marker.height
      const tint = index % 2 ? '#555f60' : '#687171'
      addStone([0, height / 2, 0], [0.18, height, 0.2], [0, 0, 0], tint, grave.matrix)
      addStone(
        [0, height * 0.72, 0],
        [height * 0.61, 0.17, 0.23],
        [0, 0, 0.015],
        tint,
        grave.matrix,
      )
      addStone([0, 0.075, 0.015], [0.39, 0.15, 0.34], [0, 0.06, 0], '#414b4c', grave.matrix)
      // A low, sunken grave slab sits beneath the mist, with no lettering.
      addStone([0, 0.035, 0.6], [0.55, 0.08, 0.92], [0, 0.03, 0], '#343e40', grave.matrix)
    }

    for (const wall of walls) {
      const dx = wall.to[0] - wall.from[0]
      const dz = wall.to[1] - wall.from[1]
      const yaw = -Math.atan2(dz, dx)
      const width = Math.hypot(dx, dz) / wall.columns
      for (let column = 0; column < wall.columns; column++) {
        const t = (column + 0.5) / wall.columns
        // Uneven surviving courses and a breach avoid a continuous solid fence.
        const courses = [3, 2, 1, 0, 1, 2, 1][(column + wall.phase) % 7]
        const x = wall.from[0] + dx * t
        const z = wall.from[1] + dz * t
        for (let course = 0; course < courses; course++) {
          const stagger = course % 2 ? width * 0.18 : -width * 0.08
          addStone(
            [x + Math.cos(yaw) * stagger, 0.115 + course * 0.22, z - Math.sin(yaw) * stagger],
            [width * (0.92 + Math.sin(column * 3.7) * 0.05), 0.21, 0.38],
            [
              Math.sin(column * 2.1 + course) * 0.04,
              yaw + Math.sin(column + course) * 0.06,
              Math.cos(column * 1.7) * 0.035,
            ],
            (column + course) % 3 ? '#424f51' : '#566163',
          )
        }
        // Each missing or low section has a few blocks spilled into the clearing.
        if (courses < 2) {
          for (let piece = 0; piece < 2; piece++) {
            const seed = column * 3 + wall.phase * 7 + piece
            addStone(
              [x + Math.sin(seed * 2.3) * 0.35, 0.095, z + 0.35 + piece * 0.24],
              [width * 0.65, 0.18, 0.3],
              [0.08, yaw + Math.sin(seed) * 1.4, Math.cos(seed * 2) * 0.2],
              '#424d4f',
            )
          }
        }
      }
    }

    const geometry = createStoneGeometry()
    const material = new MeshStandardMaterial({
      roughness: 1,
      flatShading: true,
      emissive: '#20282b',
      emissiveIntensity: 0.35,
    })
    const masonry = new InstancedMesh(geometry, material, stones.length)
    stones.forEach((stone, index) => {
      masonry.setMatrixAt(index, stone.matrix)
      masonry.setColorAt(index, stone.color)
    })
    masonry.instanceMatrix.needsUpdate = true
    if (masonry.instanceColor) masonry.instanceColor.needsUpdate = true
    masonry.computeBoundingSphere()
    // All static masonry shares a single draw call and casts no extra shadows.
    owner.add(masonry)
    return () => {
      owner.remove(masonry)
      masonry.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [compact])

  return <group ref={root} />
}
