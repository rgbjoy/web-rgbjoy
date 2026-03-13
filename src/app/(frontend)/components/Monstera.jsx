import React from 'react'
import { useGLTF } from '@react-three/drei'

const modelPath = '/Monstera/Monstera.gltf'

export function Monstera(props) {
  const { nodes } = useGLTF(modelPath)
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes['6L004'].geometry}
        material={nodes['6L004'].material}
        scale={0.386}
      />
    </group>
  )
}

if (typeof window !== 'undefined') {
  useGLTF.preload(`${window.location.origin}${modelPath}`)
}
