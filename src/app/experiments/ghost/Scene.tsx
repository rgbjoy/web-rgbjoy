'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import Scenery from './Scenery'
import Graveyard from './Graveyard'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ACESFilmicToneMapping,
  Color,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  Object3D,
  HemisphereLight,
  PointLight,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three'

import { useReducedMotion } from '../../utilities/settings/useSettings'
import { GhostCloth, HEAD_Y } from './cloth'
import { createClothMaterials } from './materials'
import { IdleDirector, type IdleActivity } from './idle'
import Fog from './Fog'
import ChargeSky, { EyeCharge } from './ChargeEffects'
import ColorGrade from './ColorGrade'
import { CHARGE_HORIZON, stepCharge, type GhostCharge } from './charge'
import { GHOST_QUALITY, type GhostQuality } from './quality'
import styles from './page.module.css'

type Pointer = { x: number; y: number; active: boolean }
type SceneProps = {
  quality: GhostQuality
  reducedMotion: boolean
  pointer: React.RefObject<Pointer>
  charge: React.RefObject<GhostCharge>
  onAttention: (near: boolean) => void
  onActivity: (activity: IdleActivity) => void
  onReady: () => void
}

function Ghost({
  quality,
  reducedMotion,
  pointer,
  charge,
  onAttention,
  onActivity,
  onReady,
}: SceneProps) {
  const root = useRef<Group>(null)
  const { camera, size } = useThree()
  const resources = useRef<{
    cloth: GhostCloth
    fabrics: ReturnType<typeof createClothMaterials>
  } | null>(null)
  const idle = useRef(new IdleDirector())
  const animation = useRef({
    time: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    near: false,
    focus: 0,
    ready: false,
    activity: 'waiting' as IdleActivity,
  })
  const scratch = useRef({
    projected: new Vector3(),
    edge: new Vector3(),
    head: new Matrix4(),
    rotation: new Quaternion(),
    euler: new Euler(),
    scale: new Vector3(1, 1, 1),
    pivot: new Vector3(0, HEAD_Y, 0),
    inversePivot: new Matrix4().makeTranslation(0, -HEAD_Y, 0),
  })

  // GPU and simulation resources are created inside an effect so Strict Mode
  // can dispose and recreate them without retaining an abandoned geometry.
  useEffect(() => {
    const owner = root.current
    if (!owner) return
    idle.current = new IdleDirector()
    animation.current.focus = 0
    const cloth = new GhostCloth(quality)
    const fabrics = createClothMaterials(quality)
    const identity = new Matrix4()
    const step = GHOST_QUALITY[quality].cloth.step
    for (let frame = 0; frame < Math.round(1 / step); frame++) cloth.update(step, identity, 0.3)
    const mesh = new Mesh(cloth.geometry, fabrics.material)
    mesh.customDepthMaterial = fabrics.depthMaterial
    mesh.castShadow = true
    mesh.receiveShadow = quality === 'desktop'
    mesh.frustumCulled = false
    const eyes = new Mesh(cloth.geometry, fabrics.eyeMaterial)
    eyes.frustumCulled = false
    owner.add(mesh, eyes)
    resources.current = { cloth, fabrics }
    return () => {
      resources.current = null
      owner.remove(mesh, eyes)
      cloth.dispose()
      fabrics.material.dispose()
      fabrics.depthMaterial.dispose()
      fabrics.eyeMaterial.dispose()
    }
  }, [quality])

  useFrame((_, frameDelta) => {
    const active = resources.current
    if (!active || !root.current) return
    const state = animation.current
    const s = scratch.current
    const dt = Math.min(frameDelta, 1 / 30)
    if (!state.ready) {
      state.ready = true
      onReady()
    }
    if (!reducedMotion) state.time += dt
    const t = state.time
    const power = charge.current.glow.value
    // The charge already eases at both ends. Squaring it keeps the first
    // moments quiet, then builds a restrained, irregular tremble at full power.
    const shake = reducedMotion ? 0 : power * power
    const shakeX = (Math.sin(t * 42) + Math.sin(t * 67 + 0.8) * 0.3) * 0.035 * shake
    const shakeRoll = Math.sin(t * 39 + 0.4) * 0.009 * shake
    const pose = idle.current.update(
      dt,
      state.near || charge.current.held || power > 0.05,
      reducedMotion,
    )
    if (state.activity !== idle.current.activity) {
      state.activity = idle.current.activity
      onActivity(state.activity)
    }

    root.current.position.set(
      (reducedMotion ? 0 : Math.sin(t * 0.47) * 0.045) + pose.x + shakeX,
      (reducedMotion ? 0.03 : 0.045 + Math.sin(t * 1.15) * 0.065 + power * 0.1) + pose.y,
      (reducedMotion ? 0 : Math.sin(t * 0.38) * 0.025) + pose.z + Math.sin(t * 37) * 0.01 * shake,
    )
    root.current.rotation.set(pose.pitch, pose.yaw, pose.roll + shakeRoll, 'YXZ')
    const width = 1 / Math.sqrt(pose.stretch)
    root.current.scale.set(width, pose.stretch, width)
    root.current.updateMatrix()

    // Project the character into CSS pixels: proximity feels the same across
    // aspect ratios, rather than having a large invisible hot area on desktop.
    s.projected.set(0, 1.65, 0).applyMatrix4(root.current.matrix).project(camera)
    s.edge.set(0.83, 1.65, 0).applyMatrix4(root.current.matrix).project(camera)
    const cx = (s.projected.x * 0.5 + 0.5) * size.width
    const cy = (-s.projected.y * 0.5 + 0.5) * size.height
    const radius = Math.max(80, Math.abs(s.edge.x - s.projected.x) * size.width * 0.5)
    const dx = pointer.current.x - cx
    const dy = pointer.current.y - cy
    const distance = Math.hypot(dx / (radius * 2.5), dy / (radius * 3.1))
    // Hysteresis keeps the gaze steady at the proximity boundary.
    const near = pointer.current.active && distance < (state.near ? 1.12 : 1)
    if (near !== state.near) {
      state.near = near
      onAttention(near)
    }
    // Keep screen axes aligned with the character's small dancing lean.
    const lookX = dx * Math.cos(pose.roll) - dy * Math.sin(pose.roll)
    const lookY = dx * Math.sin(pose.roll) + dy * Math.cos(pose.roll)
    const yaw =
      (near
        ? MathUtils.clamp((lookX / radius) * 0.27, -0.58, 0.58)
        : reducedMotion
          ? 0
          : Math.sin(t * 0.37) * 0.055) + pose.headYaw
    const pitch =
      (near
        ? MathUtils.clamp((lookY / (radius * 3)) * 0.25, -0.16, 0.19)
        : reducedMotion
          ? 0
          : Math.sin(t * 0.63 + 0.8) * 0.022) + pose.headPitch
    // An occasional tiny head cock gives the waiting pose some personality.
    const roll =
      (reducedMotion
        ? 0
        : Math.sin(t * 0.54) * 0.026 +
          Math.pow(Math.max(0, Math.sin(t * 0.19 - 1.2)), 12) * 0.065) + pose.headRoll
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * (near ? 5 : 2.2))
    state.yaw = MathUtils.lerp(state.yaw, yaw, ease)
    state.pitch = MathUtils.lerp(state.pitch, pitch, ease)
    state.roll = MathUtils.lerp(state.roll, roll, ease)

    s.euler.set(
      state.pitch + Math.sin(t * 48) * 0.006 * shake,
      state.yaw + Math.sin(t * 45 + 0.8) * 0.01 * shake,
      state.roll + Math.sin(t * 40) * 0.007 * shake,
      'YXZ',
    )
    s.rotation.setFromEuler(s.euler)
    s.head.compose(s.pivot, s.rotation, s.scale).multiply(s.inversePivot)

    // Brief, asymmetric timing avoids a mechanical repeating blink.
    const blinkPhase = t % 9.7
    const blink =
      !reducedMotion && blinkPhase > 5.8 && blinkPhase < 6.08
        ? Math.sin(((blinkPhase - 5.8) / 0.28) * Math.PI) ** 2
        : 0
    // Recognition makes the eyes just 7% shorter. Ease both directions and
    // use the same cutout as blinking so the holes and their rims stay aligned.
    state.focus = MathUtils.lerp(
      state.focus,
      near ? 0.07 : 0,
      reducedMotion ? 1 : 1 - Math.exp(-dt * 4),
    )
    active.fabrics.blink.value = Math.max(blink, pose.squint, state.focus) * (1 - power * 0.95)
    active.fabrics.charge.value = power
    active.cloth.update(
      dt,
      s.head,
      reducedMotion ? 0 : 0.35 + pose.flutter + power * 0.16,
      root.current.matrix,
    )
  }, -1)

  return (
    <group ref={root}>
      <EyeCharge charge={charge} head={scratch} quality={quality} reducedMotion={reducedMotion} />
    </group>
  )
}

function Dust({
  reducedMotion,
  charge,
}: {
  reducedMotion: boolean
  charge: React.RefObject<GhostCharge>
}) {
  const points = useRef<Group>(null)
  const material = useRef<PointsMaterial>(null)
  const colors = useRef({ idle: new Color('#d8d3bd'), ember: new Color('#ff5012') })
  const time = useRef(0)
  const [positions] = useState(() => {
    const data = new Float32Array(65 * 3)
    for (let i = 0; i < 65; i++) {
      // Fixed distribution keeps the scene deterministic on remount.
      const random = (seed: number) =>
        MathUtils.euclideanModulo(Math.sin(seed * 127.1) * 43758.5453, 1)
      data[i * 3] = (random(i + 1) - 0.5) * 4.5
      data[i * 3 + 1] = random(i + 80) * 5
      data[i * 3 + 2] = (random(i + 160) - 0.5) * 3 - 0.5
    }
    return data
  })
  useFrame((_, dt) => {
    const power = charge.current.glow.value
    if (material.current) {
      material.current.color.copy(colors.current.idle).lerp(colors.current.ember, power)
      material.current.opacity = 0.22 + power * 0.6
      material.current.size = 0.011 + power * 0.017
    }
    if (!points.current || reducedMotion) return
    time.current += Math.min(dt, 1 / 30)
    points.current.rotation.y = Math.sin(time.current * 0.035) * 0.2
    points.current.position.y = Math.sin(time.current * 0.13) * 0.12 + power * 0.2
  })
  return (
    <group ref={points}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={material}
          size={0.011}
          color="#d8d3bd"
          transparent
          opacity={0.22}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  )
}

function Stage({
  quality,
  reducedMotion,
  pointer,
  charge: chargeRef,
  onAttention,
  onActivity,
  onReady,
}: SceneProps) {
  const settings = GHOST_QUALITY[quality]
  const fill = useRef<PointLight>(null)
  const hemisphere = useRef<HemisphereLight>(null)
  const colors = useRef({
    background: new Color('#050708'),
    emberBackground: new Color(CHARGE_HORIZON),
    fill: new Color('#b8c8d1'),
    emberFill: new Color('#ff1907'),
    sky: new Color('#bccada'),
    emberSky: new Color('#ff6728'),
    ground: new Color('#181512'),
    emberGround: new Color('#542015'),
  })
  const [target] = useState(() => {
    const object = new Object3D()
    object.position.set(0, 0.7, 0)
    return object
  })
  const { camera, size } = useThree()
  useEffect(() => {
    // Give the whole character and its light pool room on narrow screens.
    camera.position.set(0, 2.6, size.width / size.height < 0.75 ? 10.8 : 8.4)
    camera.lookAt(0, 1.42, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame(({ scene }, delta) => {
    const state = chargeRef.current
    state.level = stepCharge(state.level, state.held, delta)
    const power = state.level * state.level * (3 - 2 * state.level)
    state.glow.value = power
    if (!reducedMotion) state.time.value += Math.min(delta, 0.1)
    const palette = colors.current
    if (scene.background instanceof Color)
      scene.background.copy(palette.background).lerp(palette.emberBackground, power)
    if (scene.fog) scene.fog.color.copy(palette.background).lerp(palette.emberBackground, power)
    if (fill.current) {
      fill.current.color.copy(palette.fill).lerp(palette.emberFill, power)
      fill.current.intensity = 1.1 + power * 8
    }
    if (hemisphere.current) {
      hemisphere.current.color.copy(palette.sky).lerp(palette.emberSky, power)
      hemisphere.current.groundColor.copy(palette.ground).lerp(palette.emberGround, power)
      hemisphere.current.intensity = 0.17 + power * 0.2
    }
  }, -2)

  return (
    <>
      <color attach="background" args={['#050708']} />
      <fog attach="fog" args={['#050708', 9, 26]} />
      <ambientLight intensity={0.07} color="#9aaab8" />
      <hemisphereLight ref={hemisphere} args={['#bccada', '#181512', 0.17]} />
      <primitive object={target} />
      <spotLight
        key={quality}
        position={[-3.2, 6.2, 3.5]}
        target={target}
        color="#fff0d4"
        intensity={100}
        angle={0.43}
        penumbra={0.85}
        decay={2}
        castShadow
        shadow-mapSize={[settings.shadowSize, settings.shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={4}
      />
      <spotLight
        position={[3, 4.3, -2.7]}
        target={target}
        color="#afcbdc"
        intensity={44}
        angle={0.5}
        penumbra={1}
      />
      <pointLight ref={fill} position={[-0.6, 1.5, 4]} color="#b8c8d1" intensity={1.1} />
      <ChargeSky charge={chargeRef} />
      <ColorGrade charge={chargeRef} />
      <Ghost
        quality={quality}
        reducedMotion={reducedMotion}
        pointer={pointer}
        charge={chargeRef}
        onAttention={onAttention}
        onActivity={onActivity}
        onReady={onReady}
      />
      <Scenery compact={size.width / size.height < 0.75} />
      <Graveyard compact={size.width / size.height < 0.75} />
      <Dust reducedMotion={reducedMotion} charge={chargeRef} />
      <Fog quality={quality} reducedMotion={reducedMotion} charge={chargeRef} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#25282a" roughness={0.95} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.08, 0.008, 0]}>
        <planeGeometry args={[3.2, 3.2]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          uniforms={{ color: { value: new Color('#020303') } }}
          vertexShader={`varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
          fragmentShader={`varying vec2 vUv; uniform vec3 color;
            void main() { float r = length((vUv - 0.5) * vec2(2.0, 2.4));
              gl_FragColor = vec4(color, exp(-r * r * 6.0) * 0.55); }`}
        />
      </mesh>
    </>
  )
}

const mobileQuery = '(any-pointer: coarse), (max-width: 700px)'
function subscribeQuality(onChange: () => void) {
  const query = window.matchMedia(mobileQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const clientQuality = (): GhostQuality =>
  window.matchMedia(mobileQuery).matches ? 'mobile' : 'desktop'
const serverQuality = (): GhostQuality => 'mobile'

export default function Scene() {
  const quality = useSyncExternalStore(subscribeQuality, clientQuality, serverQuality)
  const [ready, setReady] = useState(false)
  const [near, setNear] = useState(false)
  const [activity, setActivity] = useState<IdleActivity>('waiting')
  const reducedMotion = useReducedMotion()
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false })
  const charge = useRef<GhostCharge>({
    held: false,
    level: 0,
    glow: { value: 0 },
    time: { value: 0 },
  })
  const [held, setHeldState] = useState(false)
  const setHeld = useCallback((next: boolean) => {
    charge.current.held = next
    setHeldState(next)
  }, [])

  const onReady = useCallback(() => setReady(true), [])
  const onAttention = useCallback((attention: boolean) => setNear(attention), [])
  const onActivity = useCallback((next: IdleActivity) => setActivity(next), [])

  useEffect(() => {
    const onBlur = () => {
      pointer.current.active = false
      setHeld(false)
    }
    const onRelease = (event: PointerEvent) => {
      if (event.isPrimary) setHeld(false)
    }
    const onVisibility = () => {
      if (document.hidden) onBlur()
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [setHeld])

  return (
    <main
      className={styles.main}
      data-quality={quality}
      data-attention={near ? 'watching' : 'waiting'}
      data-idle={activity}
      data-held={held}
      aria-label="A cloth ghost that watches the pointer and plays while waiting"
    >
      <div
        className={styles.stage}
        data-ready={ready}
        role="button"
        tabIndex={0}
        aria-label="Hold to awaken the ghost's red eyes and ember sky"
        aria-pressed={held}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            setHeld(true)
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            setHeld(false)
          }
        }}
        onBlur={() => setHeld(false)}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          pointer.current = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
            active: true,
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setHeld(true)
          const bounds = event.currentTarget.getBoundingClientRect()
          pointer.current = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
            active: true,
          }
        }}
        onPointerLeave={() => {
          pointer.current.active = false
        }}
        onPointerUp={(event) => {
          setHeld(false)
          if (event.pointerType === 'touch') pointer.current.active = false
        }}
        onPointerCancel={() => {
          setHeld(false)
          pointer.current.active = false
        }}
        onLostPointerCapture={() => setHeld(false)}
      >
        <Canvas
          shadows
          dpr={quality === 'mobile' ? 1 : [1, GHOST_QUALITY[quality].dpr]}
          camera={{ position: [0, 2.6, 8.4], fov: 38, near: 0.1, far: 50 }}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
          fallback={
            <p className={styles.fallback}>
              This ghost needs WebGL. Enable hardware acceleration to meet it.
            </p>
          }
        >
          <Stage
            quality={quality}
            reducedMotion={reducedMotion}
            pointer={pointer}
            charge={charge}
            onAttention={onAttention}
            onActivity={onActivity}
            onReady={onReady}
          />
        </Canvas>
      </div>

      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      {!ready && (
        <p className={styles.loading} role="status">
          A presence is taking shape…
        </p>
      )}
    </main>
  )
}
