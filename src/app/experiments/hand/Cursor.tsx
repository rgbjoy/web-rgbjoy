'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Euler,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Camera,
} from 'three'

import {
  BALL_RADIUS,
  depthAt,
  depthOffset,
  FX_LAYER,
  nextHeld,
  reachFor,
  type DepthAxis,
  type Grasp,
  type ScreenPoint,
} from './grasp'
import { readout, tuning } from './tuning'

export type Pointer = { x: number; y: number; active: boolean }

/** Frame-rate independent ease toward a target. */
const approach = (from: number, to: number, dt: number, rate: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt))

/** The classic pointer outline on its 12×19 pixel grid, tip at the origin, pointing up-left. */
const ARROW_OUTLINE: [number, number][] = [
  [0, 0],
  [0, 16],
  [4, 12.5],
  [7, 19],
  [9.5, 18],
  [6.7, 11.8],
  [12, 11.8],
]
/** Arrow height in world units, against a ~2.1 unit hand. */
const ARROW_HEIGHT = 0.12
const ARROW_DEPTH = 0.0175
const ARROW_UNIT = ARROW_HEIGHT / 19
/** Where the fist closes on the arrow: the middle of its body, not the tip. */
const ARROW_MIDDLE = new Vector3(5 * ARROW_UNIT, -10 * ARROW_UNIT, 0)
/** Turned a little off the screen so its thickness reads; twisted further once caught. */
const FREE_TILT = new Euler(0.18, -0.5, 0)
const HELD_TILT = new Euler(0.5, -1, -0.4)

function arrowGeometry() {
  const shape = new Shape(
    ARROW_OUTLINE.map(([x, y]) => new Vector2(x * ARROW_UNIT, -y * ARROW_UNIT)),
  )
  const geometry = new ExtrudeGeometry(shape, {
    depth: ARROW_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 3,
  })
  geometry.translate(0, 0, -ARROW_DEPTH / 2)
  return geometry
}

/** Held, the arrow burns white: emissive well past 1 so the filmic curve clips it. */
const GLOW_EMISSIVE = 4
const REST_EMISSIVE = 0.3
/**
 * A small white light inside the fist, so the fingers glow from within. It
 * sits only ~0.1–0.2 units from the fingers and falls off with distance
 * squared, so a little goes a long way.
 */
const GLOW_LIGHT = 0.2
const GLOW_LIGHT_REACH = 0.6
/**
 * Soft halo around the held arrow, in world units. It is depth-tested, so it
 * stays local and in the scene: the fingers in front hide it, and it shows
 * through the gaps and around their edges.
 */
const HALO_SIZE = 0.3
const HALO_OPACITY = 0.6

function haloTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

/** The depth axis as currently tuned, for this camera's viewport. */
export const depthAxis = (camera: Camera): DepthAxis => ({
  angle: (tuning.depthAngle * Math.PI) / 180,
  aspect: camera instanceof PerspectiveCamera ? camera.aspect : 1,
})

/**
 * Where the marble sits for a pointer at NDC (x, y): on the pointer's ray, at
 * the depth its position along the depth axis maps to. Shared with the debug
 * path so the two agree. `gripScreen` is the grip's projected NDC position.
 */
export function cursorPosition(
  out: Vector3,
  pointer: ScreenPoint,
  camera: Camera,
  grip: Vector3,
  gripScreen: ScreenPoint,
): Vector3 {
  const depth = depthAt(
    pointer,
    { x: gripScreen.x, y: gripScreen.y, z: grip.z },
    depthAxis(camera),
    tuning.depthFront,
    tuning.depthBack,
  )
  out.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize()
  return out.multiplyScalar((depth - camera.position.z) / out.z).add(camera.position)
}

/**
 * The cursor: a white 3D arrow whose tip sits under the pointer but travels in
 * depth — in front of the hand at the left edge, behind it at the right — so
 * it can pass through the fingers, be hidden by them, and be caught. The
 * marble the grab logic tracks sits at the tip; it can be shown from `?debug`.
 */
export function Cursor({
  pointer,
  grasp: graspRef,
  ring: ringRef,
}: {
  pointer: React.RefObject<Pointer>
  grasp: React.RefObject<Grasp>
  /** The DOM ring that marks the real pointer while the cursor is held. */
  ring: React.RefObject<HTMLDivElement | null>
}) {
  const { camera } = useThree()
  const ball = useRef<Mesh>(null)
  const arrow = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  const halo = useRef<Sprite>(null)
  const state = useRef({ held: false, attach: 0, shown: 0, glow: 0 })
  const scratch = useMemo(
    () => ({
      grip: new Vector3(),
      free: new Vector3(),
      hold: new Vector3(),
      held: new Vector3(),
      middle: new Vector3(),
    }),
    [],
  )
  const parts = useMemo(
    () => ({
      ball: new SphereGeometry(BALL_RADIUS, 48, 32),
      arrow: arrowGeometry(),
      // A soft glow keeps it white and findable when the key light is behind it.
      material: new MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.4,
        emissive: '#ffffff',
        emissiveIntensity: REST_EMISSIVE,
      }),
      halo: new SpriteMaterial({
        map: haloTexture(),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    }),
    [],
  )
  // The halo is see-through light, so the shaft mask must not treat it as part of the hand.
  useEffect(() => {
    halo.current?.layers.set(FX_LAYER)
  }, [])

  useEffect(
    () => () => {
      parts.ball.dispose()
      parts.arrow.dispose()
      parts.material.dispose()
      parts.halo.map?.dispose()
      parts.halo.dispose()
    },
    [parts],
  )

  useFrame((_, frameDelta) => {
    const mesh = ball.current
    const pointerMesh = arrow.current
    if (!mesh || !pointerMesh) return
    const dt = Math.min(frameDelta, 1 / 30)
    const shared = graspRef.current
    const { x, y, active } = pointer.current
    const current = state.current

    scratch.grip.copy(shared.point).project(camera)
    const gripX = scratch.grip.x
    cursorPosition(scratch.free, { x, y }, camera, shared.point, scratch.grip)

    const distance = scratch.free.distanceTo(shared.point)
    const offset = depthOffset({ x, y }, scratch.grip, depthAxis(camera))
    const held = nextHeld(current.held, { distance, offset, active })
    Object.assign(readout, {
      pointerX: x,
      pointerY: y,
      graspScreenX: gripX,
      graspScreenY: scratch.grip.y,
      depth: scratch.free.z - shared.point.z,
      distance,
      held,
    })
    if (held !== current.held) {
      current.held = held
      if (ringRef.current) ringRef.current.dataset.held = String(held)
    }

    // Snap shut, let go a little slower; the marble rides the same timing.
    shared.grip = approach(shared.grip, held ? 1 : 0, dt, held ? 14 : 5)
    shared.reach = approach(shared.reach, !held && active ? reachFor(distance) : 0, dt, 6)
    current.attach = approach(current.attach, held ? 1 : 0, dt, held ? 16 : 10)
    current.shown = approach(current.shown, active || held ? 1 : 0, dt, 10)
    // The glow builds over about half a second once caught, and fades as it is let go.
    current.glow = approach(current.glow, held ? 1 : 0, dt, held ? 4 : 6)

    const scale = Math.max(current.shown, 0.001)
    const visible = current.shown > 0.01
    // Caught at the grip, then held a little deeper, inside the fist.
    scratch.hold.copy(shared.point).setZ(shared.point.z - tuning.holdDepth)
    mesh.position.lerpVectors(scratch.free, scratch.hold, current.attach)
    shared.marble.copy(mesh.position)
    mesh.scale.setScalar(scale)
    mesh.visible = tuning.showMarble && visible

    // The tip rides under the pointer; once caught, the fist closes on the
    // arrow's middle, so it slides in by that instead.
    const t = current.attach
    pointerMesh.rotation.set(
      FREE_TILT.x + (HELD_TILT.x - FREE_TILT.x) * t,
      FREE_TILT.y + (HELD_TILT.y - FREE_TILT.y) * t,
      FREE_TILT.z + (HELD_TILT.z - FREE_TILT.z) * t,
    )
    scratch.held.copy(ARROW_MIDDLE).applyEuler(pointerMesh.rotation).negate().add(scratch.hold)
    pointerMesh.position.lerpVectors(scratch.free, scratch.held, t)
    pointerMesh.scale.setScalar(scale)
    pointerMesh.visible = visible

    const glow = current.glow
    ;(pointerMesh.material as MeshStandardMaterial).emissiveIntensity =
      REST_EMISSIVE + (GLOW_EMISSIVE - REST_EMISSIVE) * glow
    scratch.middle.copy(ARROW_MIDDLE).applyEuler(pointerMesh.rotation).multiplyScalar(scale)
    scratch.middle.add(pointerMesh.position)
    shared.glow = glow
    shared.light.copy(scratch.middle)
    if (light.current) {
      light.current.position.copy(scratch.middle)
      light.current.intensity = GLOW_LIGHT * glow
    }
    if (halo.current) {
      halo.current.position.copy(scratch.middle)
      halo.current.scale.setScalar(HALO_SIZE * (0.6 + 0.4 * glow))
      ;(halo.current.material as SpriteMaterial).opacity = HALO_OPACITY * glow
      halo.current.visible = glow > 0.01
    }
  })

  return (
    <>
      {/* Always present at zero intensity, so catching the cursor never recompiles shaders. */}
      <pointLight ref={light} color="#ffffff" intensity={0} distance={GLOW_LIGHT_REACH} decay={2} />
      <sprite ref={halo} material={parts.halo} visible={false} />
      <mesh
        ref={arrow}
        geometry={parts.arrow}
        material={parts.material}
        castShadow
        receiveShadow
        visible={false}
      />
      <mesh
        ref={ball}
        geometry={parts.ball}
        material={parts.material}
        castShadow
        receiveShadow
        visible={false}
      />
    </>
  )
}
