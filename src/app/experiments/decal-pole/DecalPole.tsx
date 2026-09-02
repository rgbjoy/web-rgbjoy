import { Decal, Environment, PerspectiveCamera, useTexture } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { Mesh, Texture } from "three"

import {
  applyWoodRepeat,
  CAMERA,
  configureDecalTexture,
  configureWoodTextures,
  decalPositionFromCamera,
  decalPositionFromDrop,
  decalScale,
  ENVIRONMENT,
  FLYER_TEXTURE_PATH,
  POLE,
  randomTilt,
  woodTextureRepeat,
  WOOD_TEXTURE_PATHS,
  type DropPoint,
  type PoleDecal,
} from "./pole"

/** One flyer waiting to be stapled up. The key is what makes a repeat of the
 *  same image count as a new request. */
export type FlyerRequest = {
  key: number
  url: string
  /** Where the pointer let go, or null when the file picker supplied it. */
  drop: DropPoint | null
  /** Object URLs are ours to release once the texture has decoded. */
  revokeAfterLoad: boolean
}

type SceneProps = {
  flyer: FlyerRequest | null
  onReady: () => void
  onHoverChange: (hovering: boolean) => void
}

export function DecalPoleScene({ flyer, onReady, onHoverChange }: SceneProps) {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={CAMERA.FOV}
        near={CAMERA.NEAR}
        far={CAMERA.FAR}
        position={CAMERA.POSITION}
      />
      <Environment
        preset={ENVIRONMENT.PRESET}
        background={ENVIRONMENT.BACKGROUND}
        blur={ENVIRONMENT.BLUR}
      />
      <Suspense fallback={null}>
        <Pole flyer={flyer} onReady={onReady} onHoverChange={onHoverChange} />
      </Suspense>
      <CameraRig />
    </>
  )
}

/* Hoisted so drei's onLoad effect, which is keyed on the callback's identity,
   runs once per mount instead of on every render. */
function configureSeedFlyer(texture: Texture | Texture[]) {
  if (!Array.isArray(texture)) configureDecalTexture(texture)
}

function Pole({ flyer, onReady, onHoverChange }: SceneProps) {
  const meshRef = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.renderer.domElement)
  const [decals, setDecals] = useState<PoleDecal[]>([])

  const wood = useTexture(WOOD_TEXTURE_PATHS)
  const seedFlyer = useTexture(FLYER_TEXTURE_PATH, configureSeedFlyer)

  // useTexture suspends, so reaching this effect means every map has decoded
  // and the pole is on screen — that is what the fade-in waits for.
  useEffect(() => onReady(), [onReady])

  useEffect(() => {
    configureWoodTextures(wood)
    const { uRepeat, vRepeat } = woodTextureRepeat(POLE.RADIUS, POLE.HEIGHT)
    applyWoodRepeat(wood, uRepeat, vRepeat)
  }, [wood])

  // The seed flyer is the joke the page opens on, so it is stapled up at a
  // fixed spot rather than wherever the camera happens to start. It is not in
  // state because nothing ever moves or removes it.
  const flyers = useMemo<PoleDecal[]>(
    () => [
      {
        id: 0,
        texture: seedFlyer,
        angle: POLE.INITIAL_DECAL_ANGLE,
        height: POLE.INITIAL_DECAL_HEIGHT,
        tilt: POLE.SEED_TILT,
      },
      ...decals,
    ],
    [seedFlyer, decals],
  )

  useEffect(() => {
    if (!flyer) return

    const loader = new THREE.TextureLoader()
    let mounted = true

    loader.load(flyer.url, (texture) => {
      if (flyer.revokeAfterLoad) URL.revokeObjectURL(flyer.url)
      if (!mounted) return

      configureDecalTexture(texture)

      const placement =
        (meshRef.current && flyer.drop
          ? decalPositionFromDrop(flyer.drop, meshRef.current, camera, canvas, POLE.HEIGHT)
          : null) ?? decalPositionFromCamera(camera, POLE.HEIGHT)

      setDecals((previous) => [
        ...previous,
        { id: flyer.key, texture, ...placement, tilt: randomTilt() },
      ])
    })

    return () => {
      mounted = false
    }
  }, [flyer, camera, canvas])

  return (
    <group scale={POLE.SCALE}>
      <mesh
        ref={meshRef}
        castShadow
        receiveShadow
        position={[0, POLE.HEIGHT / 2, 0]}
        onPointerEnter={() => onHoverChange(true)}
        onPointerLeave={() => onHoverChange(false)}
      >
        <cylinderGeometry args={[POLE.RADIUS, POLE.RADIUS, POLE.HEIGHT, 64, 1, true]} />
        <meshStandardMaterial
          color="#ffffff"
          metalness={0}
          roughness={0.9}
          side={THREE.DoubleSide}
          map={wood.map}
          normalMap={wood.normalMap}
          bumpMap={wood.bumpMap}
          bumpScale={0.2}
        />
        {flyers.map((decal, index) => {
          const image = decal.texture.image as { width?: number; height?: number } | undefined
          const { sx, sy } = decalScale(image?.width ?? 1, image?.height ?? 1)
          // Each flyer stands a hair further off the pole than the one before,
          // so an overlapping stack resolves by depth instead of z-fighting.
          const radius =
            POLE.RADIUS + POLE.Z_FIGHTING_OFFSET + index * POLE.Z_FIGHTING_INCREMENT

          return (
            <Decal
              key={decal.id}
              renderOrder={10 + index}
              position={[
                Math.sin(decal.angle) * radius,
                decal.height - POLE.HEIGHT / 2,
                Math.cos(decal.angle) * radius,
              ]}
              rotation={[0, decal.angle, decal.tilt]}
              scale={[sx, sy, 1]}
              map={decal.texture}
              material-transparent
              material-depthWrite={false}
              material-polygonOffset
              material-polygonOffsetFactor={-4}
              material-polygonOffsetUnits={-20}
            />
          )
        })}
      </mesh>
    </group>
  )
}

/** Distance the camera keeps from the pole's axis before viewport nudges. */
const BASE_DISTANCE = Math.hypot(
  CAMERA.POSITION[0] - CAMERA.TARGET[0],
  CAMERA.POSITION[2] - CAMERA.TARGET[2],
)

/** Narrow and hand-held viewports each pull the camera back a step, so the
 *  pole reads the same whether it is a phone held upright or a wide window. */
function viewportDistance(): number {
  if (typeof window === "undefined") return BASE_DISTANCE

  const portrait = window.innerHeight > window.innerWidth ? 1.2 : 1
  const coarse = window.matchMedia("(pointer: coarse)").matches ? 1.2 : 1
  return BASE_DISTANCE * portrait * coarse
}

/**
 * Orbit-and-climb rig. Horizontal input spins the camera around the pole,
 * vertical input walks it up and down, and both carry momentum on release.
 * The camera stays level throughout: it looks straight across at the pole
 * rather than tilting toward a fixed point, so flyers never keystone.
 */
function CameraRig() {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.renderer.domElement)

  const target = useMemo(() => new THREE.Vector3(...CAMERA.TARGET), [])
  const lookAt = useMemo(() => new THREE.Vector3(), [])
  const scrollMaxY = POLE.HEIGHT * CAMERA.SCROLL_MAX_Y_MULTIPLIER

  const orbitAngle = useRef(0)
  const targetY = useRef<number>(CAMERA.SCROLL_MIN_Y)
  const distance = useRef(BASE_DISTANCE)

  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, angle: 0, targetY: 0 })
  const last = useRef({ x: 0, y: 0, time: 0 })

  const velocityAngle = useRef(0)
  const velocityY = useRef(0)

  const clampY = useCallback(
    (y: number) => Math.max(CAMERA.SCROLL_MIN_Y, Math.min(scrollMaxY, y)),
    [scrollMaxY],
  )

  useEffect(() => {
    orbitAngle.current = Math.atan2(
      camera.position.x - target.x,
      camera.position.z - target.z,
    )
    targetY.current = camera.position.y
    distance.current = viewportDistance()

    const onResize = () => {
      distance.current = viewportDistance()
    }

    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [camera, target])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      // Shift-wheel is how a one-axis mouse asks to orbit; trackpads send
      // deltaX directly.
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX
      if (horizontal !== 0) {
        orbitAngle.current += horizontal * CAMERA.ORBIT_SPEED
        return
      }

      targetY.current = clampY(targetY.current + event.deltaY * 0.01)
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [canvas, clampY])

  useEffect(() => {
    // Drag speed is doubled against wheel orbit so a swipe covers ground.
    const dragSpeed = CAMERA.ORBIT_SPEED * 2

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return

      dragging.current = true
      dragStart.current = {
        x: event.clientX,
        y: event.clientY,
        angle: orbitAngle.current,
        targetY: targetY.current,
      }
      last.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }
      velocityAngle.current = 0
      velocityY.current = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return

      // Milliseconds, floored at one so a same-tick move cannot divide by zero.
      const elapsed = Math.max(1, event.timeStamp - last.current.time)
      velocityAngle.current = (-(event.clientX - last.current.x) / elapsed) * dragSpeed * 1000
      velocityY.current = ((event.clientY - last.current.y) / elapsed) * dragSpeed * 1000

      // Both axes track the gesture rather than the pointer: drag left and the
      // pole turns left, drag down and the camera follows your hand down.
      orbitAngle.current = dragStart.current.angle - (event.clientX - dragStart.current.x) * dragSpeed
      targetY.current = clampY(
        dragStart.current.targetY + (event.clientY - dragStart.current.y) * dragSpeed,
      )

      last.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }
    }

    const onPointerUp = () => {
      dragging.current = false
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [canvas, clampY])

  useFrame((_, delta) => {
    if (!dragging.current) {
      velocityAngle.current *= CAMERA.FRICTION
      velocityY.current *= CAMERA.FRICTION

      if (Math.abs(velocityAngle.current) > 0.0001) {
        orbitAngle.current += velocityAngle.current * delta
      } else {
        velocityAngle.current = 0
      }

      if (Math.abs(velocityY.current) > 0.0001) {
        targetY.current = clampY(targetY.current + velocityY.current * delta)
      } else {
        velocityY.current = 0
      }
    }

    // Dragging tracks the hand closely; the glide afterwards is softer.
    const easing = dragging.current ? 0.5 : CAMERA.EASING_FACTOR
    const y = clampY(camera.position.y + (targetY.current - camera.position.y) * easing)

    camera.position.set(
      target.x + Math.sin(orbitAngle.current) * distance.current,
      y,
      target.z + Math.cos(orbitAngle.current) * distance.current,
    )

    lookAt.set(target.x, y, target.z)
    camera.lookAt(lookAt)
  })

  return null
}
