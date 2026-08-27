"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import type { RefObject } from "react"
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Material, Mesh, Object3D } from "three"
import { PCFShadowMap, PlaneGeometry } from "three"

import { PALM_STEM_BASE_LIFT_Y, PalmFrond } from "./PalmFrond"
import styles from "./PalmLeafBackground.module.css"

export {
  PALM_FROND_FLOAT_Y,
  PALM_LEAFLET_T_END,
  PALM_LEAFLET_T_START,
  PALM_STEM_BASE_LIFT_Y,
  PalmFrond,
} from "./PalmFrond"
export type { PalmFrondProps } from "./PalmFrond"

type PalmSurfaceOrig = { colorWrite: boolean; depthWrite: boolean }

const PALM_SURFACE_ORIG_KEY = "palmSurfaceOrig"
const WIREFRAME_ORIG_KEY = "palmWireframeOrig"

/** The opening view. Feeds the camera, the controls target, and the reset. */
const CAMERA_POSITION: [number, number, number] = [-3.13, 2.45, 5.1]
const CAMERA_TARGET: [number, number, number] = [-4.73, 0.16, 3.52]

/** Uniform scale for palm geometry and frond layout spacing only. */
const PALM_FROND_SCALE = 2

/**
 * Crown layout. Every frond starts on the same pivot (that is what
 * PALM_STEM_BASE_LIFT_Y is for) and is aimed by two nested rotations:
 * `azimuth` spins it around the crown axis, `pitch` tips it away from that
 * axis in the plane the rachis already arcs through, so the arc reads as
 * droop rather than a sideways bend.
 *
 * Azimuth fans the fronds across one side rather than ringing the full 2π.
 * Pitch is measured from the crown axis, so π/2 is horizontal; these sit well
 * under it, leaving the crown climbing toward the sky. The rachis arch is what
 * brings the tips back down, the way a real frond throws up and then falls.
 * Fronds nearer the middle of the fan stand up most, outer ones lean away.
 *
 * `windTimeOffset` is the only thing separating the fronds now that they
 * share a position: it seeds the stem S-bend as well as the wind phase.
 */
const PALM_CROWN_FRONDS = [
  { azimuth: -0.85, pitch: 0.91, windTimeOffset: 0 },
  { azimuth: -0.43, pitch: 0.78, windTimeOffset: 1.7 },
  { azimuth: 0.02, pitch: 0.63, windTimeOffset: 3.1 },
  { azimuth: 0.44, pitch: 0.8, windTimeOffset: 4.5 },
  { azimuth: 0.86, pitch: 0.89, windTimeOffset: 6.2 },
]

/**
 * Half turn about each frond's own length axis, so it rests on its other face
 * and the leaflets hang instead of cupping upward. Applied innermost: the axis
 * runs through the shared base, so the bases stay put.
 *
 * The roll also carries the rachis arc to the frond's other side, so pitch has
 * to tip that way too — hence the sign on the pitch rotation below. Tipping
 * the old way would fight the curve and swing the crown out of frame.
 */
const PALM_FROND_ROLL = Math.PI

/**
 * The crown converges on the world origin, so the ground drops by the gap that
 * used to sit between them (crown y 2, floor y −2.5).
 */
const FLOOR_Y = -4.5

const FLOOR_PLANE_SIZE = 80
/** Doubled with the plane, so the mound mesh keeps its resolution per unit. */
const FLOOR_PLANE_SEGMENTS = 144
const FLOOR_MOUND_AMPLITUDE = 0.53
const FLOOR_MOUND_FREQ = 0.6

function createUndulatingFloorGeometry() {
  const geo = new PlaneGeometry(
    FLOOR_PLANE_SIZE,
    FLOOR_PLANE_SIZE,
    FLOOR_PLANE_SEGMENTS,
    FLOOR_PLANE_SEGMENTS,
  )
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const n =
      Math.sin(x * FLOOR_MOUND_FREQ) * Math.cos(y * FLOOR_MOUND_FREQ * 0.92) +
      0.42 *
      Math.sin(x * FLOOR_MOUND_FREQ * 2.1 + 0.7) *
      Math.cos(y * FLOOR_MOUND_FREQ * 2.03 + 0.35)
    pos.setZ(i, n * FLOOR_MOUND_AMPLITUDE)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function forEachMaterial(mesh: Mesh, fn: (mat: Material) => void) {
  const m = mesh.material
  if (Array.isArray(m)) m.forEach(fn)
  else if (m) fn(m)
}

/** Hide the lit palm surface, crown and trunk (no color / no depth in the beauty pass); geometry still casts shadows. */
function PalmSurfaceHiddenSync({
  palmsHidden,
  palmRootRef,
}: {
  palmsHidden: boolean
  palmRootRef: RefObject<Object3D | null>
}) {
  useLayoutEffect(() => {
    const root = palmRootRef.current
    if (!root) return

    root.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return

      forEachMaterial(mesh, (mat) => {
        const ud = mat.userData as Record<string, unknown>
        if (!ud[PALM_SURFACE_ORIG_KEY]) {
          ud[PALM_SURFACE_ORIG_KEY] = {
            colorWrite: mat.colorWrite,
            depthWrite: mat.depthWrite,
          } satisfies PalmSurfaceOrig
        }
        const orig = ud[PALM_SURFACE_ORIG_KEY] as PalmSurfaceOrig
        if (palmsHidden) {
          mat.colorWrite = false
          mat.depthWrite = false
        } else {
          mat.colorWrite = orig.colorWrite
          mat.depthWrite = orig.depthWrite
        }
      })
    })
  }, [palmsHidden, palmRootRef])

  return null
}

/** Debug view (W): whole scene as wireframe, so frond layout and the floor mesh are readable. */
function WireframeSync({ wireframe }: { wireframe: boolean }) {
  const scene = useThree((state) => state.scene)

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return

      forEachMaterial(mesh, (mat) => {
        const target = mat as Material & { wireframe?: boolean }
        if (target.wireframe === undefined) return

        const ud = target.userData as Record<string, unknown>
        if (ud[WIREFRAME_ORIG_KEY] === undefined) {
          ud[WIREFRAME_ORIG_KEY] = target.wireframe
        }
        target.wireframe = wireframe
          ? true
          : (ud[WIREFRAME_ORIG_KEY] as boolean)
      })
    })
  }, [wireframe, scene])

  return null
}

/**
 * Debug readout (C): logs the live camera as a paste-ready snippet. Reads the
 * OrbitControls target too — position alone will not reproduce a view, since
 * the same point can be looked at from any orientation.
 */
function CameraReadout() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as {
    target?: { x: number; y: number; z: number }
  } | null

  useEffect(() => {
    const round = (n: number) => Math.round(n * 100) / 100

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key !== "c" && e.key !== "C") return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const { position: p, rotation: r } = camera
      const t = controls?.target

      console.log(
        [
          `camera={{ position: [${round(p.x)}, ${round(p.y)}, ${round(p.z)}], fov: 45 }}`,
          t
            ? `<OrbitControls target={[${round(t.x)}, ${round(t.y)}, ${round(t.z)}]} ... />`
            : "(no controls target — is makeDefault set?)",
          `rotation, radians: [${round(r.x)}, ${round(r.y)}, ${round(r.z)}]`,
        ].join("\n"),
      )
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [camera, controls])

  return null
}

/**
 * Puts the camera back on the opening view whenever it re-locks. Sets position
 * and target explicitly rather than calling controls.reset(): reset() restores
 * the values captured when the controls were constructed, which is before the
 * declarative `target` prop lands on them.
 */
function CameraReset({ locked }: { locked: boolean }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as {
    target?: { set: (x: number, y: number, z: number) => void }
    update?: () => void
  } | null

  useEffect(() => {
    if (!locked) return
    camera.position.set(...CAMERA_POSITION)
    controls?.target?.set(...CAMERA_TARGET)
    controls?.update?.()
  }, [locked, camera, controls])

  return null
}

export const ShaderPalmLeafCanvas = memo(function ShaderPalmLeafCanvas() {
  // Opens on the shadows alone — the palm itself is revealed with H.
  const [palmsHidden, setPalmsHidden] = useState(true)
  const [wireframe, setWireframe] = useState(false)
  const palmRootRef = useRef<Object3D>(null)

  const floorGeometry = useMemo(() => createUndulatingFloorGeometry(), [])

  useEffect(() => {
    return () => {
      floorGeometry.dispose()
    }
  }, [floorGeometry])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (e.key === "h" || e.key === "H") {
        setPalmsHidden((v) => !v)
      }
      if (e.key === "w" || e.key === "W") {
        setWireframe((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Canvas
      className={styles.canvas}
      shadows
      camera={{ position: CAMERA_POSITION, fov: 45 }}
      gl={{ antialias: false, alpha: false }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFShadowMap
      }}
    >
      <color attach="background" args={["#e8eaed"]} />

      {/*
        Slightly off vertical, so the crown's shadow reads across the ground
        instead of collapsing into its own footprint. Tilt further and the
        frustum has to grow with it, since the shadows then land further out
        than the crown is wide.

        Shadow settings are the original PCF ones, tuned for three 0.180.
        The frustum is the one exception: it was ±7, which clipped the outer
        fronds' shadows dead at the boundary once the crown spread out.
      */}
      <directionalLight
        castShadow
        position={[3, 14, 2]}
        intensity={2.4}
        color="#fffaf0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={8}
      />
      <directionalLight
        position={[0.35, 6, 0.45]}
        intensity={0.25}
        color="#eef5ff"
      />

      {/* Crown axis is +Y. Fronds share this group's origin, which is world 0,0,0. */}
      <group ref={palmRootRef} scale={PALM_FROND_SCALE}>
        {PALM_CROWN_FRONDS.map(({ azimuth, pitch, windTimeOffset }) => (
          <group key={windTimeOffset} rotation={[0, azimuth, 0]}>
            <group rotation={[0, 0, pitch]}>
              <group rotation={[0, PALM_FROND_ROLL, 0]}>
                <PalmFrond
                  position={[0, PALM_STEM_BASE_LIFT_Y, 0]}
                  windTimeOffset={windTimeOffset}
                />
              </group>
            </group>
          </group>
        ))}
      </group>

      <PalmSurfaceHiddenSync
        palmsHidden={palmsHidden}
        palmRootRef={palmRootRef}
      />

      <WireframeSync wireframe={wireframe} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y, 0]}
        receiveShadow
        geometry={floorGeometry}
      >
        <meshStandardMaterial color="#ffffff" roughness={1} metalness={0} />
      </mesh>

      <CameraReadout />
      <CameraReset locked={palmsHidden} />

      {/* Locked on the opening shadows-only view; H reveals the palm and frees the camera. */}
      <OrbitControls
        makeDefault
        enabled={!palmsHidden}
        target={CAMERA_TARGET}
        minDistance={3.2}
        maxDistance={11}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI * 0.48}
      />
    </Canvas>
  )
})

export default ShaderPalmLeafCanvas
