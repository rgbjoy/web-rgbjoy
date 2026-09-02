import { useLayoutEffect, useMemo, useRef } from "react"
import { ConeGeometry, CylinderGeometry, InstancedMesh, Object3D } from "three/webgpu"

import { createTreePlacements } from "./treePlacement"
import type { IslandHeightfield, IslandSettings } from "./terrain"

/** Darker than the high-grass band they stand on, so the canopy reads against it. */
const FOLIAGE_COLOR = "#1f6b34"
const TRUNK_COLOR = "#4a3526"

const TRUNK_HEIGHT = 0.14
const FOLIAGE_HEIGHT = 0.35

type TreesProps = {
  settings: IslandSettings
  heightfield: IslandHeightfield
}

export function Trees({ settings, heightfield }: TreesProps) {
  const placements = useMemo(
    () => createTreePlacements(settings, heightfield),
    [settings, heightfield],
  )

  const trunkRef = useRef<InstancedMesh>(null)
  const foliageRef = useRef<InstancedMesh>(null)

  /* Both parts are translated so their base sits at the origin, which lets one
     instance matrix drive the trunk and the canopy together. */
  const trunkGeometry = useMemo(() => {
    const geometry = new CylinderGeometry(0.018, 0.028, TRUNK_HEIGHT, 5)
    geometry.translate(0, TRUNK_HEIGHT / 2, 0)
    return geometry
  }, [])

  const foliageGeometry = useMemo(() => {
    const geometry = new ConeGeometry(0.12, FOLIAGE_HEIGHT, 6)
    geometry.translate(0, TRUNK_HEIGHT + FOLIAGE_HEIGHT / 2, 0)
    return geometry
  }, [])

  useLayoutEffect(
    () => () => {
      trunkGeometry.dispose()
      foliageGeometry.dispose()
    },
    [trunkGeometry, foliageGeometry],
  )

  useLayoutEffect(() => {
    const { count, positions, scales, rotations } = placements
    const transform = new Object3D()

    for (let index = 0; index < count; index += 1) {
      transform.position.set(
        positions[index * 3],
        positions[index * 3 + 1],
        positions[index * 3 + 2],
      )
      transform.rotation.set(0, rotations[index], 0)
      transform.scale.setScalar(scales[index])
      transform.updateMatrix()
      trunkRef.current?.setMatrixAt(index, transform.matrix)
      foliageRef.current?.setMatrixAt(index, transform.matrix)
    }

    for (const mesh of [trunkRef.current, foliageRef.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [placements])

  if (placements.count === 0) return null

  return (
    // Instance count is fixed when the mesh is built, so a changed count needs
    // a fresh pair rather than an update.
    <group key={placements.count}>
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeometry, undefined, placements.count]}
        castShadow
      >
        <meshStandardMaterial color={TRUNK_COLOR} flatShading roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={foliageRef}
        args={[foliageGeometry, undefined, placements.count]}
        castShadow
      >
        <meshStandardMaterial color={FOLIAGE_COLOR} flatShading roughness={0.88} />
      </instancedMesh>
    </group>
  )
}
