'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, DirectionalLight, Object3D, Vector3 } from 'three'

import { useReducedMotion } from '../../utilities/settings/useSettings'
import { Cursor, type Pointer } from './Cursor'
import { CursorPath, debugEnabled, DepthLine, GraspMarker, TopView, TuningPanel } from './Debug'
import Grade from './Grade'
import type { Grasp } from './grasp'
import { HandModel } from './HandModel'
import { LOOP_SECONDS, sampleLoop, type HandPose } from './loop'
import styles from './page.module.css'

/** Reduced motion holds the loop mid-ripple, the most sculptural frame. */
const STILL_AT = LOOP_SECONDS * 0.6

/** Lights are placed in screen space: x right, y up, z toward the viewer. */
const LIGHT_TARGET = new Vector3(0, -1, 0)
const LIGHT_DISTANCE = 8
const KEY_FROM = new Vector3(1, 0.9, -0.45).normalize()
const RIM_FROM = new Vector3(-1, 0.3, -1.2).normalize()
const FILL_FROM = new Vector3(-0.6, -0.2, 1).normalize()
const UP = new Vector3(0, 1, 0)

const placed = (from: Vector3) =>
  from.clone().multiplyScalar(LIGHT_DISTANCE).add(LIGHT_TARGET).toArray()

type StageProps = {
  reducedMotion: boolean
  debug: boolean
  pointer: React.RefObject<Pointer>
  ring: React.RefObject<HTMLDivElement | null>
  onReady: () => void
}

function Stage({ reducedMotion, debug, pointer, ring, onReady }: StageProps) {
  const pose = useRef<HandPose>(sampleLoop(STILL_AT))
  const grasp = useRef<Grasp>({
    point: new Vector3(),
    grip: 0,
    reach: 0,
    marble: new Vector3(),
    glow: 0,
    light: new Vector3(),
  })
  const time = useRef(0)
  const key = useRef<DirectionalLight>(null)
  const [target] = useState(() => {
    const object = new Object3D()
    object.position.copy(LIGHT_TARGET)
    return object
  })

  useEffect(() => {
    const light = key.current
    if (!light) return
    // Hard, tight shadows: the fingers shading the palm is most of the drama.
    const shadow = light.shadow.camera
    shadow.left = shadow.bottom = -2
    shadow.right = shadow.top = 2
    shadow.near = 0.1
    shadow.far = LIGHT_DISTANCE * 2
    shadow.updateProjectionMatrix()
  }, [])

  useFrame(
    (_, delta) => {
      if (!reducedMotion) time.current += Math.min(delta, 0.1)
      sampleLoop(reducedMotion ? STILL_AT : time.current, pose.current)
      key.current?.position
        .copy(KEY_FROM)
        .applyAxisAngle(UP, pose.current.light)
        .multiplyScalar(LIGHT_DISTANCE)
        .add(LIGHT_TARGET)
      // Updates run highest priority first: loop clock, then the hand, then the cursor.
    },
    { priority: 2 },
  )

  return (
    <>
      <color attach="background" args={['#000000']} />
      <primitive object={target} />
      <directionalLight
        ref={key}
        position={placed(KEY_FROM)}
        target={target}
        intensity={4.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={placed(RIM_FROM)} target={target} intensity={4} />
      <directionalLight position={placed(FILL_FROM)} target={target} intensity={0.35} />
      <Suspense fallback={null}>
        <HandModel pose={pose} grasp={grasp} reducedMotion={reducedMotion} onReady={onReady} />
        <Cursor pointer={pointer} grasp={grasp} ring={ring} />
        {debug && <GraspMarker grasp={grasp} />}
        {debug && <CursorPath grasp={grasp} pointer={pointer} />}
        {debug && <DepthLine grasp={grasp} pointer={pointer} />}
        {debug && <TopView grasp={grasp} />}
      </Suspense>
      <Grade frozen={reducedMotion} grasp={grasp} />
    </>
  )
}

export default function Scene() {
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false })
  const [debug] = useState(debugEnabled)
  const ring = useRef<HTMLDivElement>(null)

  const track = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    pointer.current = {
      x: (x / bounds.width) * 2 - 1,
      y: 1 - (y / bounds.height) * 2,
      active: true,
    }
    if (ring.current) ring.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }, [])

  useEffect(() => {
    const onBlur = () => {
      pointer.current.active = false
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  return (
    <main
      className={styles.main}
      aria-label="A sculpted hand in black and white, its fingers slowly rolling closed and open. Bring the pointer into the hand's grasp and the hand catches it; pull left or right to free it."
    >
      <div
        className={styles.stage}
        data-ready={ready}
        onPointerMove={track}
        onPointerDown={(event) => {
          // Touch drags keep reporting even when they cross the grasp.
          if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId)
          track(event)
        }}
        onPointerLeave={(event) => {
          // Touch pointers "leave" on lift; leave the marble where the finger was.
          if (event.pointerType === 'mouse') pointer.current.active = false
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, -1, 12], fov: 24, near: 0.1, far: 60 }}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1
          }}
          fallback={
            <p className={styles.fallback}>This hand needs WebGL. Enable hardware acceleration.</p>
          }
        >
          <Stage
            reducedMotion={reducedMotion}
            debug={debug}
            pointer={pointer}
            ring={ring}
            onReady={onReady}
          />
        </Canvas>
        <div ref={ring} className={styles.ring} data-held="false" aria-hidden="true" />
      </div>
      {debug && <TuningPanel />}
      {!ready && (
        <p className={styles.loading} role="status">
          Developing…
        </p>
      )}
    </main>
  )
}
