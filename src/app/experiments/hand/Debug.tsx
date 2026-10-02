'use client'

import { useFrame, useThree } from '@react-three/fiber'
import GUI from 'lil-gui'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  SphereGeometry,
  Vector3,
} from 'three'

import { cursorPosition, depthAxis, type Pointer } from './Cursor'
import {
  depthOffset,
  GRAB_BAND,
  GRAB_RADIUS,
  RELEASE_BAND,
  type DepthAxis,
  type Grasp,
  type ScreenPoint,
} from './grasp'
import styles from './page.module.css'
import { readout, tuning } from './tuning'

/** The top-down inset drawn while "Show cursor path" is on, in CSS pixels. */
const INSET_SIZE = 240
const INSET_MARGIN = 16
/** World units from the grasp point to the inset's edge. */
const INSET_SPAN = 1.8

export const debugEnabled = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

/** The `?debug` panel: grasp-point nudges, grab curls, and a live readout. */
export function TuningPanel() {
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const gui = new GUI({ title: 'Hand' })
    const showInset = (show: boolean) => {
      if (frame.current) frame.current.hidden = !show
    }
    showInset(tuning.showPath)

    const grasp = gui.addFolder('Grasp point (world units)')
    grasp.add(tuning, 'graspX', -0.8, 0.8, 0.01).name('X → right')
    grasp.add(tuning, 'graspY', -0.8, 0.8, 0.01).name('Y ↑ up')
    grasp.add(tuning, 'graspZ', -0.8, 0.8, 0.01).name('Z toward you')
    grasp.add(tuning, 'showZone').name('Show grasp zone')
    grasp.add(tuning, 'showPath').name('Show cursor path').onChange(showInset)
    grasp.add(tuning, 'showMarble').name('Show marble (3D cursor)')

    const glow = gui.addFolder('Glow & shafts')
    glow.add(tuning, 'holdDepth', 0, 0.8, 0.01).name('Held depth (behind)')
    glow.add(tuning, 'shaftSource', 0.02, 0.8, 0.01).name('Shaft source size')
    glow.add(tuning, 'shaftStrength', 0, 5, 0.05).name('Shaft strength')

    const depth = gui.addFolder('Depth (world units)')
    depth.add(tuning, 'depthFront', 0, 4.5, 0.05).name('Front reach')
    depth.add(tuning, 'depthBack', 0, 4, 0.05).name('Back reach')
    depth.add(tuning, 'depthAngle', -90, 90, 1).name('Angle °')
    depth.add(tuning, 'showDepth').name('Show depth line')

    const fingers = gui.addFolder('Fingers (degrees)')
    fingers.add(tuning, 'fingerIdle', -30, 30, 1).name('Idle ±')
    fingers.add(tuning, 'fingerGrab', -30, 30, 1).name('Held ±')

    const thumb = gui.addFolder('Thumb (degrees)')
    thumb.add(tuning, 'thumbIdle', -20, 50, 1).name('Idle')
    thumb.add(tuning, 'thumbGrab', -10, 60, 1).name('Held')
    thumb.add(tuning, 'thumbTip', -3, 3, 0.05).name('Tip hinge ×')

    const live = gui.addFolder('Live (screen, -1…1)')
    for (const [key, name] of [
      ['pointerX', 'Pointer x'],
      ['pointerY', 'Pointer y'],
      ['graspScreenX', 'Grasp x'],
      ['graspScreenY', 'Grasp y'],
      ['depth', 'Depth (+ toward you)'],
      ['distance', 'Distance'],
    ] as const)
      live.add(readout, key).name(name).decimals(3).listen().disable()
    live.add(readout, 'held').name('Held').listen().disable()

    gui
      .add(
        {
          copy: () => {
            const keys = Object.keys(tuning).filter((key) => !key.startsWith('show'))
            void navigator.clipboard?.writeText(JSON.stringify(tuning, keys))
          },
        },
        'copy',
      )
      .name('Copy values')

    return () => gui.destroy()
  }, [])

  return (
    <div
      ref={frame}
      className={styles.topView}
      style={{ width: INSET_SIZE, height: INSET_SIZE, left: INSET_MARGIN, bottom: INSET_MARGIN }}
      hidden
      aria-hidden="true"
    >
      <span>top view · you are below</span>
    </div>
  )
}

/** The grasp point and its catch radius, drawn through the hand when "Show grasp zone" is on. */
export function GraspMarker({ grasp: graspRef }: { grasp: React.RefObject<Grasp> }) {
  const group = useRef<Group>(null)
  const { zone, dot, zoneMaterial, dotMaterial } = useMemo(
    () => ({
      zone: new SphereGeometry(GRAB_RADIUS, 24, 16),
      dot: new SphereGeometry(0.025, 12, 8),
      zoneMaterial: new MeshBasicMaterial({
        color: '#ffffff',
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
      }),
      dotMaterial: new MeshBasicMaterial({ color: '#ffffff', depthTest: false }),
    }),
    [],
  )
  useEffect(
    () => () => {
      zone.dispose()
      dot.dispose()
      zoneMaterial.dispose()
      dotMaterial.dispose()
    },
    [zone, dot, zoneMaterial, dotMaterial],
  )

  useFrame(
    () => {
      if (!group.current) return
      group.current.visible = tuning.showZone
      group.current.position.copy(graspRef.current.point)
      // After the cursor (priority 0) has placed the marble and grasp for this frame.
    },
    { priority: -1 },
  )

  return (
    <group ref={group} visible={false}>
      <mesh geometry={zone} material={zoneMaterial} renderOrder={10} />
      <mesh geometry={dot} material={dotMaterial} renderOrder={10} />
    </group>
  )
}

/**
 * Evenly spaced NDC points along the depth axis through `through`, clipped to
 * the screen, from the front end to the back end. The axis direction in NDC is
 * (cos / aspect, sin), the on-screen angle squashed back into NDC.
 */
function alongAxis(through: ScreenPoint, { angle, aspect }: DepthAxis, out: ScreenPoint[]) {
  const dx = Math.cos(angle) / aspect
  const dy = Math.sin(angle)
  let from = -Infinity
  let to = Infinity
  for (const [origin, step] of [
    [through.x, dx],
    [through.y, dy],
  ]) {
    if (Math.abs(step) < 1e-6) continue
    const a = (-1 - origin) / step
    const b = (1 - origin) / step
    from = Math.max(from, Math.min(a, b))
    to = Math.min(to, Math.max(a, b))
  }
  if (!(from < to)) from = to = 0
  out.forEach((point, i) => {
    const t = from + ((to - from) * i) / (out.length - 1)
    point.x = through.x + dx * t
    point.y = through.y + dy * t
  })
  return out
}

const PATH_SAMPLES = 120
const TRAIL_LENGTH = 90

/** A line of `count` points with per-vertex brightness, drawn over or under the hand. */
function makeLine(count: number, overHand: boolean, opacity: number, geometry?: BufferGeometry) {
  const shared =
    geometry ??
    (() => {
      const created = new BufferGeometry()
      created.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
      created.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3))
      return created
    })()
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthTest: !overHand,
    depthWrite: false,
  })
  const line = new Line(shared, material)
  line.frustumCulled = false
  line.renderOrder = 9
  return line
}

/**
 * Where the marble would travel at the pointer's current height as the
 * pointer sweeps left to right — front of the hand to back — plus the trail
 * it actually left. The path draws solid where it is in front of the hand and
 * faint where the hand hides it; it is brightest where a grab can fire.
 */
export function CursorPath({
  grasp: graspRef,
  pointer,
}: {
  grasp: React.RefObject<Grasp>
  pointer: React.RefObject<Pointer>
}) {
  const { camera } = useThree()
  const group = useRef<Group>(null)
  const resources = useRef<{
    path: BufferGeometry
    trail: BufferGeometry
    lines: Line[]
    history: Vector3[]
    samples: ScreenPoint[]
    scratch: { grip: Vector3; point: Vector3 }
  } | null>(null)

  useEffect(() => {
    const owner = group.current
    if (!owner) return
    const visiblePath = makeLine(PATH_SAMPLES, false, 1)
    const hiddenPath = makeLine(PATH_SAMPLES, true, 0.25, visiblePath.geometry)
    const trail = makeLine(TRAIL_LENGTH, true, 0.9)
    const lines = [visiblePath, hiddenPath, trail]
    owner.add(...lines)
    resources.current = {
      path: visiblePath.geometry,
      trail: trail.geometry,
      lines,
      history: [],
      samples: Array.from({ length: PATH_SAMPLES }, () => ({ x: 0, y: 0 })),
      scratch: { grip: new Vector3(), point: new Vector3() },
    }
    return () => {
      resources.current = null
      owner.remove(...lines)
      visiblePath.geometry.dispose()
      trail.geometry.dispose()
      for (const line of lines) (line.material as LineBasicMaterial).dispose()
    }
  }, [])

  useFrame(
    () => {
      const parts = resources.current
      if (!parts || !group.current) return
      group.current.visible = tuning.showPath
      if (!tuning.showPath) {
        parts.history.length = 0
        return
      }
      const grasp = graspRef.current
      const { grip, point } = parts.scratch
      grip.copy(grasp.point).project(camera)
      const axis = depthAxis(camera)
      const samples = alongAxis(pointer.current, axis, parts.samples)

      const position = parts.path.getAttribute('position') as BufferAttribute
      const color = parts.path.getAttribute('color') as BufferAttribute
      samples.forEach((sample, i) => {
        cursorPosition(point, sample, camera, grasp.point, grip)
        position.setXYZ(i, point.x, point.y, point.z)
        const offset = Math.abs(depthOffset(sample, grip, axis))
        const inReach = point.distanceTo(grasp.point) < GRAB_RADIUS && offset < GRAB_BAND
        const shade = inReach ? 1 : offset <= RELEASE_BAND ? 0.6 : 0.35
        color.setXYZ(i, shade, shade, shade)
      })
      position.needsUpdate = true
      color.needsUpdate = true

      const history = parts.history
      if (pointer.current.active || grasp.grip > 0.01) {
        history.push(grasp.marble.clone())
        if (history.length > TRAIL_LENGTH) history.shift()
      }
      const trailPosition = parts.trail.getAttribute('position') as BufferAttribute
      const trailColor = parts.trail.getAttribute('color') as BufferAttribute
      history.forEach((entry, i) => {
        trailPosition.setXYZ(i, entry.x, entry.y, entry.z)
        const fade = (i + 1) / history.length
        trailColor.setXYZ(i, fade, fade, fade)
      })
      trailPosition.needsUpdate = true
      trailColor.needsUpdate = true
      parts.trail.setDrawRange(0, history.length)
    },
    { priority: -1 },
  )

  return <group ref={group} visible={false} />
}

/**
 * Renders the scene from straight above into a corner of the screen, so the
 * depth path reads as what it is: a diagonal from in front of the hand (left)
 * to behind it (right). Drawn after the grade, so it stays clean and in colour.
 */
export function TopView({ grasp: graspRef }: { grasp: React.RefObject<Grasp> }) {
  const { gl, scene, size } = useThree()
  const camera = useMemo(() => {
    const view = new OrthographicCamera(
      -INSET_SPAN,
      INSET_SPAN,
      INSET_SPAN,
      INSET_SPAN * -1,
      0.1,
      40,
    )
    // Looking down with the viewer's side (+z) at the bottom of the inset.
    view.up.set(0, 0, -1)
    return view
  }, [])

  useFrame(
    () => {
      if (!tuning.showPath) return
      const { x, y, z } = graspRef.current.point
      camera.position.set(x, y + 15, z)
      camera.lookAt(x, y, z)
      camera.updateMatrixWorld()
      gl.setScissorTest(true)
      gl.setViewport(INSET_MARGIN, INSET_MARGIN, INSET_SIZE, INSET_SIZE)
      gl.setScissor(INSET_MARGIN, INSET_MARGIN, INSET_SIZE, INSET_SIZE)
      gl.render(scene, camera)
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
      // Render phase, lower priority than the grade (0), so the inset lands on top of it.
    },
    { phase: 'render', priority: -1 },
  )

  return null
}

const ROD_SAMPLES = 64
const ROD_SIDES = 8
/** A constant world radius, so perspective thins the rod as it recedes. */
const ROD_RADIUS = 0.012
const ROD_UP = new Vector3(0, 1, 0)
const ROD_RIGHT = new Vector3(1, 0, 0)

/**
 * The cursor's depth path at the pointer's height, drawn as a rod rather than
 * a line. Seen from the main camera it runs across the screen, but its
 * thickness tapers with distance and the hand hides it where it passes
 * behind, so the front-to-back travel reads without the top view. Dots mark
 * the front end, where it crosses the grip's depth, and the back end.
 */
export function DepthLine({
  grasp: graspRef,
  pointer,
}: {
  grasp: React.RefObject<Grasp>
  pointer: React.RefObject<Pointer>
}) {
  const { camera } = useThree()
  const group = useRef<Group>(null)
  const resources = useRef<{
    rod: BufferGeometry
    marks: Mesh[]
    path: Vector3[]
    samples: ScreenPoint[]
    scratch: { grip: Vector3; tangent: Vector3; side: Vector3; lift: Vector3 }
  } | null>(null)

  useEffect(() => {
    const owner = group.current
    if (!owner) return
    const rod = new BufferGeometry()
    rod.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(ROD_SAMPLES * ROD_SIDES * 3), 3),
    )
    const index: number[] = []
    for (let i = 0; i < ROD_SAMPLES - 1; i++)
      for (let j = 0; j < ROD_SIDES; j++) {
        const a = i * ROD_SIDES + j
        const b = i * ROD_SIDES + ((j + 1) % ROD_SIDES)
        index.push(a, a + ROD_SIDES, b, b, a + ROD_SIDES, b + ROD_SIDES)
      }
    rod.setIndex(index)
    // Solid where it is in front of the hand, a faint ghost where the hand hides it.
    const solid = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide })
    const ghost = new MeshBasicMaterial({
      color: '#ffffff',
      side: DoubleSide,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    })
    const markGeometry = new SphereGeometry(0.04, 16, 12)
    const rods = [new Mesh(rod, solid), new Mesh(rod, ghost)]
    const marks = [0, 1, 2].map(() => new Mesh(markGeometry, solid))
    for (const mesh of [...rods, ...marks]) mesh.frustumCulled = false
    rods[1].renderOrder = 9
    owner.add(...rods, ...marks)
    resources.current = {
      rod,
      marks,
      path: Array.from({ length: ROD_SAMPLES }, () => new Vector3()),
      samples: Array.from({ length: ROD_SAMPLES }, () => ({ x: 0, y: 0 })),
      scratch: {
        grip: new Vector3(),
        tangent: new Vector3(),
        side: new Vector3(),
        lift: new Vector3(),
      },
    }
    return () => {
      resources.current = null
      owner.remove(...rods, ...marks)
      rod.dispose()
      markGeometry.dispose()
      solid.dispose()
      ghost.dispose()
    }
  }, [])

  useFrame(
    () => {
      const parts = resources.current
      if (!parts || !group.current) return
      group.current.visible = tuning.showDepth
      if (!tuning.showDepth) return
      const grasp = graspRef.current
      const { grip, tangent, side, lift } = parts.scratch
      grip.copy(grasp.point).project(camera)
      const axis = depthAxis(camera)
      const samples = alongAxis(pointer.current, axis, parts.samples)
      parts.path.forEach((point, i) => cursorPosition(point, samples[i], camera, grasp.point, grip))

      const position = parts.rod.getAttribute('position') as BufferAttribute
      parts.path.forEach((point, i) => {
        const before = parts.path[Math.max(i - 1, 0)]
        const after = parts.path[Math.min(i + 1, ROD_SAMPLES - 1)]
        tangent.subVectors(after, before).normalize()
        // A steep axis runs nearly along "up"; cross with "right" instead.
        side
          .crossVectors(tangent, Math.abs(tangent.dot(ROD_UP)) > 0.9 ? ROD_RIGHT : ROD_UP)
          .normalize()
        lift.crossVectors(side, tangent)
        for (let j = 0; j < ROD_SIDES; j++) {
          const angle = (j / ROD_SIDES) * Math.PI * 2
          const k = i * ROD_SIDES + j
          position.setXYZ(
            k,
            point.x + (side.x * Math.cos(angle) + lift.x * Math.sin(angle)) * ROD_RADIUS,
            point.y + (side.y * Math.cos(angle) + lift.y * Math.sin(angle)) * ROD_RADIUS,
            point.z + (side.z * Math.cos(angle) + lift.z * Math.sin(angle)) * ROD_RADIUS,
          )
        }
      })
      position.needsUpdate = true

      const [front, crossing, back] = parts.marks
      front.position.copy(parts.path[0])
      back.position.copy(parts.path[ROD_SAMPLES - 1])
      // Where the axis through the pointer crosses the grip's depth: step back
      // along it by the pointer's offset (the axis advances 1/aspect per unit).
      const t = -depthOffset(pointer.current, grip, axis) * axis.aspect
      const at = {
        x: pointer.current.x + (Math.cos(axis.angle) / axis.aspect) * t,
        y: pointer.current.y + Math.sin(axis.angle) * t,
      }
      cursorPosition(crossing.position, at, camera, grasp.point, grip)
    },
    { priority: -1 },
  )

  return <group ref={group} visible={false} />
}
