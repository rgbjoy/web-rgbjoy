"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import { AUTO_ROTATE_SPEED, createIdleAutoRotate } from "./autoRotate"
import {
  createIslandGeometry,
  createIslandHeightfield,
  type IslandSettings,
} from "./terrain"
import { Trees } from "./Trees"
import { useMediaQuery } from "./useMediaQuery"
import { createWaterMaterial, PREVIEW_OCEAN_SIZE } from "./waterMaterial"

type IslandSceneProps = {
  settings: IslandSettings
  showWater: boolean
  showBiomes: boolean
  showTrees: boolean
}

function IslandOrbitControls({
  target,
}: {
  target: [number, number, number]
}) {
  const camera = useThree((state) => state.camera)
  const renderer = useThree((state) => state.renderer)
  const invalidate = useThree((state) => state.invalidate)
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true)

  const controls = useMemo(
    () => new OrbitControls(camera),
    [camera],
  )
  const autoRotation = useMemo(() => createIdleAutoRotate(controls), [controls])

  useEffect(() => {
    // Connect in the effect so Strict Mode's cleanup/reconnect stays symmetric.
    controls.connect(renderer.domElement)
    const onChange = () => invalidate()
    controls.addEventListener("change", onChange)
    controls.addEventListener("start", autoRotation.start)
    controls.addEventListener("end", autoRotation.end)
    return () => {
      controls.removeEventListener("change", onChange)
      controls.removeEventListener("start", autoRotation.start)
      controls.removeEventListener("end", autoRotation.end)
      controls.dispose()
    }
  }, [controls, renderer, invalidate, autoRotation])

  // Damping runs before anything in the update phase reads the camera. Fiber 10
  // replaced the old negative-priority form with a named phase; this is what
  // drei's own OrbitControls moved to.
  useFrame(
    (_, delta) => {
      autoRotation.update(delta, reducedMotion)
    },
    { before: "update" },
  )

  return (
    <primitive
      object={controls}
      enablePan={false}
      enableDamping
      autoRotateSpeed={AUTO_ROTATE_SPEED}
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
  showTrees,
}: IslandSceneProps) {
  const { camera, size } = useThree()
  const compact = size.width <= 720
  const lookY = compact ? 0.35 : 1.15
  const heightfield = useMemo(() => createIslandHeightfield(settings), [settings])
  const geometry = useMemo(
    () => createIslandGeometry(settings, heightfield),
    [settings, heightfield],
  )
  const water = useMemo(
    () => createWaterMaterial(settings, heightfield),
    [settings, heightfield],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(
    () => () => {
      water.material.dispose()
      water.colorMap.dispose()
    },
    [water],
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
      <color attach="background" args={["#318be0"]} />
      <fog attach="fog" args={["#318be0", 70, 135]} />

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

      {showTrees ? <Trees settings={settings} heightfield={heightfield} /> : null}

      {showWater ? (
        <>
          {/* One plane now carries both the open ocean and the shallows; the
              shore ramp lives in its material. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, settings.waterLevel, 0]}
            receiveShadow
          >
            <planeGeometry args={[PREVIEW_OCEAN_SIZE, PREVIEW_OCEAN_SIZE]} />
            <primitive object={water.material} attach="material" />
          </mesh>
        </>
      ) : null}

      <IslandOrbitControls target={[0, lookY, 0]} />
    </>
  )
}
