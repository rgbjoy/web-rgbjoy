import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  interactionGroups,
  Physics,
  InstancedRigidBodies,
  RapierRigidBody,
  InstancedRigidBodyProps,
  RigidBody,
} from '@react-three/rapier'
import { Attractor } from '@react-three/rapier-addons'

const Rig404 = () => {
  const COUNT = 50
  const refMesh = useRef<THREE.InstancedMesh>(null)
  const rigidBodies = useRef<RapierRigidBody[]>(null)

  // Generate random values once using a seeded approach
  const randomData = useMemo(() => {
    const colors = ['rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)']
    const instances: InstancedRigidBodyProps[] = []
    const colorIndices: number[] = []
    const radius = 2

    // Generate all random values upfront to avoid reassignment
    const randomValuesArray: number[] = []
    let seed = 12345
    for (let i = 0; i < COUNT * 3; i++) {
      // Generate enough values for positions and colors
      seed = (seed * 9301 + 49297) % 233280
      randomValuesArray.push(seed / 233280)
    }

    let randomIndex = 0
    const seededRandom = () => randomValuesArray[randomIndex++]

    for (let i = 0; i < COUNT; i++) {
      // Generate random angles for spherical coordinates using seeded random
      const theta = (seededRandom() ?? 0) * 2 * Math.PI
      const phi = (seededRandom() ?? 0) * Math.PI

      // Calculate Cartesian coordinates from spherical coordinates
      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta)
      const z = radius * Math.cos(phi)

      instances.push({
        key: `instance_${i}`,
        position: [x, y, z],
        collisionGroups: interactionGroups(1),
      })

      colorIndices.push(Math.floor((seededRandom() ?? 0) * colors.length))
    }

    return { instances, colorIndices, colors }
  }, [])

  useEffect(() => {
    if (!refMesh.current) return
    if (refMesh.current) {
      for (let i = 0; i < COUNT; i++) {
        const colorIndex = randomData.colorIndices[i]
        if (colorIndex !== undefined) {
          const color = new THREE.Color(randomData.colors[colorIndex])
          refMesh.current!.setColorAt(i, color)
          refMesh.current!.instanceColor!.needsUpdate = true
        }
      }
    }
  }, [refMesh, randomData])

  return (
    <Physics gravity={[0, 0, 0]}>
      <InstancedRigidBodies ref={rigidBodies} instances={randomData.instances} colliders="ball">
        <instancedMesh ref={refMesh} args={[undefined, undefined, COUNT]} count={COUNT}>
          <sphereGeometry args={[0.1]} />
          <meshBasicMaterial
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthTest={false}
            transparent={true}
            toneMapped={false}
          />
          <Attractor strength={-0.01} range={0.45} collisionGroups={interactionGroups(0, 1)} />
        </instancedMesh>
      </InstancedRigidBodies>

      <RigidBody position={[0, 0, 0]} colliders="ball" type="fixed">
        <mesh>
          <sphereGeometry args={[0.1]} />
          <meshBasicMaterial color={'white'} transparent={true} opacity={0} />
        </mesh>
        <Attractor strength={0.001} collisionGroups={interactionGroups(0, 1)} />
      </RigidBody>

      {/* <OrbitControls /> */}
    </Physics>
  )
}

export default Rig404
