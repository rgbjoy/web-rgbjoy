"use client"

import { useFrame, useThree } from "@react-three/fiber/webgpu"
import { useEffect, useMemo } from "react"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import {
  createIslandGeometry,
  createShallowWaterGeometry,
  ISLAND_SIZE,
  type IslandSettings,
} from "./terrain"

type IslandSceneProps = {
  settings: IslandSettings
  showWater: boolean
  showBiomes: boolean
}

function IslandOrbitControls({
  target,
}: {
  target: [number, number, number]
}) {
  const camera = useThree((state) => state.camera)
  const renderer = useThree((state) => state.renderer)
  const invalidate = useThree((state) => state.invalidate)

  const controls = useMemo(
    () => new OrbitControls(camera, renderer.domElement),
    [camera, renderer],
  )

  useEffect(() => {
    const onChange = () => invalidate()
    controls.addEventListener("change", onChange)
    return () => {
      controls.removeEventListener("change", onChange)
      controls.dispose()
    }
  }, [controls, invalidate])

  useFrame(() => {
    controls.update()
  }, -1)

  return (
    <primitive
      object={controls}
      enablePan={false}
      enableDamping
      minDistance={28}
      maxDistance={80}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI * 0.47}
      target={target}
    />
  )
}

export function IslandScene({
  settings,
  showWater,
  showBiomes,
}: IslandSceneProps) {
  const { camera, size } = useThree()
  const compact = size.width <= 720
  const lookY = compact ? 0.35 : 1.15
  const geometry = useMemo(
    () => createIslandGeometry(settings),
    [settings],
  )
  const shallowWaterGeometry = useMemo(
    () => createShallowWaterGeometry(settings),
    [settings],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(
    () => () => shallowWaterGeometry.dispose(),
    [shallowWaterGeometry],
  )

  useEffect(() => {
    if (compact) {
      camera.position.set(42, 31.5, 52.5)
    } else {
      camera.position.set(30.5, 25, 37.5)
    }
    camera.lookAt(0, lookY, 0)
    camera.updateProjectionMatrix()
  }, [camera, compact, lookY])

  return (
    <>
      <color attach="background" args={["#aeb3ad"]} />
      <fog attach="fog" args={["#aeb3ad", 70, 135]} />

      <hemisphereLight args={["#f3f7ef", "#4b695a", 1.55]} />
      <directionalLight
        castShadow
        position={[-28, 45, 30]}
        intensity={2.6}
        color="#fff7df"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
      />

      <mesh geometry={geometry} castShadow receiveShadow>
        {showBiomes ? (
          <meshStandardMaterial
            key="biomes"
            color="#ffffff"
            vertexColors
            flatShading
            roughness={0.94}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            key="neutral"
            color="#c8c0ad"
            flatShading
            roughness={0.94}
            metalness={0}
          />
        )}
      </mesh>

      {showWater ? (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, settings.waterLevel, 0]}
            receiveShadow
          >
            <planeGeometry args={[ISLAND_SIZE * 3.4, ISLAND_SIZE * 3.4]} />
            <meshStandardMaterial
              color="#318be0"
              roughness={0.5}
              metalness={0.05}
            />
          </mesh>

          <mesh geometry={shallowWaterGeometry} receiveShadow>
            <meshStandardMaterial
              color="#70cef2"
              roughness={0.46}
              metalness={0.02}
            />
          </mesh>
        </>
      ) : null}

      <IslandOrbitControls target={[0, lookY, 0]} />
    </>
  )
}
