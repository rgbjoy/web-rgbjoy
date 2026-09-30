'use client'

import { useEffect, useRef } from 'react'
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type Point = [number, number, number]

// Fixed paths make a crooked, bare tree without a model download or animation.
const limbs: { radius: number; points: Point[] }[] = [
  {
    radius: 0.19,
    points: [
      [0, 0, 0],
      [-0.13, 0.75, 0.02],
      [0.03, 1.5, 0],
      [-0.16, 2.2, 0.05],
      [-0.07, 2.95, 0],
      [-0.28, 3.65, 0.04],
      [-0.21, 4.3, 0.02],
    ],
  },
  {
    radius: 0.105,
    points: [
      [-0.02, 1.3, 0],
      [-0.57, 1.85, 0.1],
      [-0.97, 2.15, 0.16],
      [-1.2, 2.82, 0.12],
      [-1.61, 3.07, 0.18],
    ],
  },
  {
    radius: 0.047,
    points: [
      [-0.97, 2.15, 0.16],
      [-1.52, 2.35, 0.06],
      [-1.87, 2.7, 0.02],
    ],
  },
  {
    radius: 0.026,
    points: [
      [-1.2, 2.82, 0.12],
      [-1.14, 3.26, 0.16],
      [-1.32, 3.6, 0.15],
    ],
  },
  {
    radius: 0.092,
    points: [
      [-0.13, 2.1, 0.04],
      [0.48, 2.48, -0.06],
      [0.83, 3.06, -0.13],
      [1.37, 3.29, -0.09],
      [1.6, 3.79, -0.08],
    ],
  },
  {
    radius: 0.042,
    points: [
      [0.83, 3.06, -0.13],
      [0.61, 3.65, -0.16],
      [0.86, 4.09, -0.18],
    ],
  },
  {
    radius: 0.056,
    points: [
      [-0.1, 2.9, 0],
      [-0.7, 3.35, -0.2],
      [-0.89, 3.95, -0.3],
      [-1.2, 4.21, -0.26],
    ],
  },
  {
    radius: 0.035,
    points: [
      [-0.27, 3.6, 0.04],
      [0.17, 3.97, 0.1],
      [0.3, 4.45, 0.13],
    ],
  },
  {
    radius: 0.018,
    points: [
      [1.37, 3.29, -0.09],
      [1.82, 3.35, 0],
      [2.02, 3.61, 0.05],
    ],
  },
]

const stones = [
  { position: [-1.68, 0.14, -0.9], scale: [0.44, 0.22, 0.32], yaw: 0.4 },
  { position: [-2.12, 0.07, -0.65], scale: [0.23, 0.12, 0.18], yaw: 1.2 },
  { position: [1.48, 0.09, -0.7], scale: [0.3, 0.16, 0.23], yaw: 2.1 },
  { position: [1.85, 0.06, -1.02], scale: [0.17, 0.1, 0.15], yaw: 0.7 },
  { position: [-2.75, 0.2, -3.1], scale: [0.68, 0.33, 0.47], yaw: 1.7 },
  { position: [-2.04, 0.09, -3.5], scale: [0.31, 0.15, 0.22], yaw: 2.8 },
  { position: [2.25, 0.16, -3.5], scale: [0.5, 0.27, 0.39], yaw: 0.2 },
  { position: [2.84, 0.07, -3.2], scale: [0.25, 0.14, 0.22], yaw: 1.9 },
  { position: [0.45, 0.06, -4.3], scale: [0.24, 0.1, 0.18], yaw: 0.9 },
] as const

export default function Scenery({ compact }: { compact: boolean }) {
  const root = useRef<Group>(null)

  useEffect(() => {
    const owner = root.current
    if (!owner) return
    const up = new Vector3(0, 1, 0)
    const start = new Vector3()
    const end = new Vector3()
    const direction = new Vector3()
    const transform = new Object3D()
    const bark = new Color()
    const pieces: CylinderGeometry[] = []
    for (const [limbIndex, limb] of limbs.entries()) {
      for (let i = 0; i < limb.points.length - 1; i++) {
        start.fromArray(limb.points[i])
        end.fromArray(limb.points[i + 1])
        direction.subVectors(end, start)
        const taper = i / (limb.points.length - 1)
        const radius = limb.radius * (1 - taper * 0.88)
        const nextRadius = limb.radius * (1 - ((i + 1) / (limb.points.length - 1)) * 0.88)
        const piece = new CylinderGeometry(
          nextRadius,
          radius,
          direction.length() + radius * 0.4,
          6,
          1,
        )
        transform.position.copy(start).add(end).multiplyScalar(0.5)
        transform.quaternion.setFromUnitVectors(up, direction.normalize())
        transform.scale.set(1, 1, 1)
        transform.updateMatrix()
        piece.applyMatrix4(transform.matrix)
        const colors = new Float32Array(piece.attributes.position.count * 3)
        bark.setRGB(0.22 + (limbIndex % 3) * 0.012, 0.24, 0.24 - (i % 2) * 0.018)
        for (let vertex = 0; vertex < piece.attributes.position.count; vertex++)
          bark.toArray(colors, vertex * 3)
        piece.setAttribute('color', new BufferAttribute(colors, 3))
        pieces.push(piece)
      }
    }
    const treeGeometry = mergeGeometries(pieces)
    pieces.forEach((piece) => piece.dispose())
    const treeMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      emissive: '#182125',
      emissiveIntensity: 0.35,
    })
    const tree = new Mesh(treeGeometry, treeMaterial)
    tree.position.set(compact ? 1.75 : 2.5, 0, -3.8)
    tree.scale.setScalar(compact ? 0.85 : 1)
    tree.rotation.y = -0.24

    const rockGeometry = new IcosahedronGeometry(1, 1)
    const positions = rockGeometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i)
      const irregularity = 1 + Math.sin(x * 9.7 + y * 5.3 + z * 7.1) * 0.12
      positions.setXYZ(i, x * irregularity, Math.max(-0.62, y * irregularity), z * irregularity)
    }
    rockGeometry.computeVertexNormals()
    const rockMaterial = new MeshStandardMaterial({
      roughness: 1,
      flatShading: true,
      emissive: '#161d20',
      emissiveIntensity: 0.25,
    })
    const rocks = new InstancedMesh(rockGeometry, rockMaterial, stones.length)
    stones.forEach((stone, i) => {
      transform.position.fromArray(stone.position)
      transform.scale.fromArray(stone.scale)
      transform.rotation.set(0.08 * (i % 3), stone.yaw, 0.12 * (i % 2))
      transform.updateMatrix()
      rocks.setMatrixAt(i, transform.matrix)
      rocks.setColorAt(i, bark.set(i % 3 === 0 ? '#535b5c' : '#434b4c'))
    })
    rocks.instanceMatrix.needsUpdate = true
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true
    rocks.computeBoundingSphere()
    // Static scenery adds two draw calls and no additional shadow passes.
    owner.add(tree, rocks)
    return () => {
      owner.remove(tree, rocks)
      treeGeometry.dispose()
      treeMaterial.dispose()
      rockGeometry.dispose()
      rockMaterial.dispose()
      rocks.dispose()
    }
  }, [compact])

  return <group ref={root} />
}
