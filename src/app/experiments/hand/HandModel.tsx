'use client'

import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { GRAB_CURL, type Grasp } from './grasp'
import { FINGER_SEGMENTS, FINGERS, THUMB_REST, type Finger, type HandPose } from './loop'
import { tuning } from './tuning'

const MODEL_URL = '/models/hand/hand.glb'
/** The glTF is in metres; a ~2 unit hand keeps the light and shadow numbers readable. */
const MODEL_SCALE = 10
/** Rest pose in model space: fingers run along -Z, the palm faces +X, the thumb points up +Y. */
const PALM_NORMAL = new Vector3(1, 0, 0)
/**
 * The angle picked in the Blender look-dev pass: the thumb side, a little
 * behind the knuckles, fingers hanging. Given as where the camera sits
 * relative to the hand (model space) and which way is up on screen.
 */
const VIEW_FROM = new Vector3(-0.6, 1, -0.1)
const SCREEN_UP = new Vector3(0.3, 0, 1)
/** Share of the hand that runs off the top edge, hiding the cut wrist. */
const WRIST_CROP = 0.2
/** Negative space around the hand. It goes to the bottom and sides; the wrist stays cropped. */
const BREATHING_ROOM = 1.45
/**
 * Where a held marble sits, in metres from the middle knuckle: out in front of
 * the palm, toward the curled fingertips and the thumb — the hollow the camera
 * can see into from the thumb side, rather than deep in the palm where the
 * back of the hand would hide it.
 */
const GRIP_FROM_PALM = 0.03
const GRIP_ALONG_FINGER = 0.03
const GRIP_TOWARD_THUMB = 0.01
/** In model space the thumb points up +Y. */
const THUMB_SIDE = new Vector3(0, 1, 0)
/** How far the fingers open as the ball approaches, as a share of their curl. */
const REACH_OPEN = 0.35
/** How far in front of the palm the thumb folds toward, in metres. */
const THUMB_TARGET_FROM_PALM = 0.02
const DEG = Math.PI / 180
/**
 * While holding the cursor the hand gives it a slow, smooth shake, like
 * feeling the weight of something in a closed fist. Two blended sines per
 * axis at around 2Hz keep it organic rather than jittery.
 */
const SHAKE_ROLL = 0.9 * DEG
const SHAKE_PITCH = 0.6 * DEG
const SHAKE_LIFT = 0.01
const shakeWave = (time: number, slow: number, fast: number, phase: number) =>
  (Math.sin(Math.PI * 2 * slow * time + phase) +
    0.5 * Math.sin(Math.PI * 2 * fast * time + phase * 2)) /
  1.5

type Joint = {
  bone: Object3D
  rest: Quaternion
  /** Bend axis in the bone's own frame, so the curl composes onto its rest rotation. */
  axis: Vector3
  share: number
  finger: Finger | 'Thumb'
  /** The thumb's last joint, whose hinge is tunable live. */
  thumbTip?: boolean
}

/** Turns the model so the look-dev camera angle faces a camera on +Z. */
const FACING = (() => {
  const back = VIEW_FROM.clone().normalize()
  const right = new Vector3().crossVectors(SCREEN_UP, back).normalize()
  const up = new Vector3().crossVectors(back, right)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, back)).invert()
})()

/** The hollow of the hand in model space. It rides on the metacarpals, which never animate. */
function hollowOf(root: Object3D): Vector3 {
  root.updateMatrixWorld(true)
  const knuckle = root.getObjectByName('Middle_Proximal_L')
  const next = knuckle?.children[0]
  if (!knuckle || !next) return new Vector3()
  const from = knuckle.getWorldPosition(new Vector3())
  const along = next.getWorldPosition(new Vector3()).sub(from).normalize()
  return from
    .addScaledVector(PALM_NORMAL, GRIP_FROM_PALM)
    .addScaledVector(along, GRIP_ALONG_FINGER)
    .addScaledVector(THUMB_SIDE, GRIP_TOWARD_THUMB)
}

function rigJoints(root: Object3D): Joint[] {
  root.updateMatrixWorld(true)
  const joints: Joint[] = []
  const position = (name: string) =>
    root.getObjectByName(name)?.getWorldPosition(new Vector3()) ?? new Vector3()
  const add = (
    name: string,
    finger: Joint['finger'],
    share: number,
    toward?: Vector3,
    thumbTip = false,
  ) => {
    const bone = root.getObjectByName(name)
    const next = bone?.children[0]
    if (!bone || !next) return
    const from = bone.getWorldPosition(new Vector3())
    const along = next.getWorldPosition(new Vector3()).sub(from).normalize()
    // Fingers fold toward the palm. The thumb sits side-on to the palm, so
    // folding it the same way bends it sideways; it folds toward a point in
    // front of the palm instead.
    const bend = toward ? toward.clone().sub(from).projectOnPlane(along) : PALM_NORMAL
    // Across the digit, so a positive angle folds it toward `bend`.
    const toBone = bone.getWorldQuaternion(new Quaternion()).invert()
    const across = (toward: Vector3) =>
      along.clone().cross(toward).normalize().applyQuaternion(toBone)
    // The tip hinges the opposite way to the joints below it; folding it
    // toward the palm centre too bent it the wrong way.
    const axis = across(bend)
    joints.push({
      bone,
      rest: bone.quaternion.clone(),
      axis: thumbTip ? axis.negate() : axis,
      share,
      finger,
      thumbTip,
    })
  }
  for (const finger of FINGERS)
    for (const [segment, share] of FINGER_SEGMENTS) add(`${finger}_${segment}_L`, finger, share)
  const palm = position('Middle_Metacarpal_L')
    .add(position('Middle_Proximal_L'))
    .multiplyScalar(0.5)
    .addScaledVector(PALM_NORMAL, THUMB_TARGET_FROM_PALM)
  // The metacarpal swings the whole thumb across the palm; the joints above it curl.
  add('Thumb_Metacarpal_L', 'Thumb', 0.5, palm)
  add('Thumb_Proximal_L', 'Thumb', 1, palm)
  add('Thumb_Distal_L', 'Thumb', 1, palm, true)
  return joints
}

export function HandModel({
  pose,
  grasp,
  reducedMotion,
  onReady,
}: {
  pose: React.RefObject<HandPose>
  grasp: React.RefObject<Grasp>
  reducedMotion: boolean
  onReady: () => void
}) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  const { camera, size } = useThree()
  const sway = useRef<Group>(null)
  const facing = useRef<Group>(null)
  const ready = useRef(false)
  const shakeTime = useRef(0)
  const turn = useMemo(() => new Quaternion(), [])

  // Clone so the cached glTF keeps its rest pose; the joints capture rest
  // rotations, and a remount must not read back a curled hand.
  const { model, joints, hollow, material } = useMemo(() => {
    const model = cloneSkeleton(gltf.scene)
    const material = new MeshStandardMaterial({ color: '#d8d6d0', roughness: 0.55 })
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.material = material
      object.castShadow = true
      object.receiveShadow = true
      // Skinned bounds are computed in bind pose; curled fingers can leave them.
      object.frustumCulled = false
    })
    return { model, joints: rigJoints(model), hollow: hollowOf(model), material }
  }, [gltf])

  useEffect(() => () => material.dispose(), [material])

  /** `open` poses the hand as if nothing were held, for framing. */
  const applyPose = (open = false) => {
    const current = pose.current
    const closed = open ? 0 : grasp.current.grip
    const reach = open ? 0 : grasp.current.reach
    const opening = 1 - REACH_OPEN * reach
    for (const joint of joints) {
      const { finger } = joint
      const idle =
        finger === 'Thumb'
          ? current.thumb + (tuning.thumbIdle - THUMB_REST) * DEG
          : current.curl[finger] + tuning.fingerIdle * DEG
      const loop = idle * opening
      const grab =
        finger === 'Thumb' ? tuning.thumbGrab * DEG : GRAB_CURL[finger] + tuning.fingerGrab * DEG
      const curl = loop + (grab - loop) * closed
      const share = joint.thumbTip ? tuning.thumbTip : joint.share
      joint.bone.quaternion
        .copy(joint.rest)
        .multiply(turn.setFromAxisAngle(joint.axis, curl * share))
    }
    if (sway.current) {
      // Holding steadies the idle sway, and the shake eases in as the fist closes.
      const steady = 1 - 0.7 * closed
      const shake = reducedMotion ? 0 : closed * closed
      const t = shakeTime.current
      sway.current.rotation.z =
        current.sway * steady + shakeWave(t, 2.1, 3.4, 0) * SHAKE_ROLL * shake
      sway.current.rotation.x = shakeWave(t, 1.7, 2.9, 1.1) * SHAKE_PITCH * shake
      sway.current.position.y =
        current.lift * steady + shakeWave(t, 2.6, 4.1, 2.3) * SHAKE_LIFT * shake
    }
  }

  // Frame from the posed hand, not the flat bind pose, so the crop matches
  // what is on screen — always the open, idle pose, so resizing while the
  // fist is closed doesn't frame it tighter. Narrow screens fit the width
  // instead. Horizontally the opening of the hand is centred, as far as the
  // whole hand stays in frame.
  useLayoutEffect(() => {
    const root = sway.current
    if (!root || !facing.current || !(camera instanceof PerspectiveCamera)) return
    applyPose(true)
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root, true)
    const opening = hollow.clone().applyMatrix4(facing.current.matrixWorld).x + tuning.graspX
    const height = box.max.y - box.min.y
    const width = box.max.x - box.min.x
    const top = box.max.y - height * WRIST_CROP
    const bottom = box.min.y - height * 0.06
    const aspect = size.width / size.height
    const frame = Math.max((top - bottom) * BREATHING_ROOM, (width * 1.2) / aspect)
    const depth = (box.max.z + box.min.z) / 2
    const distance = frame / 2 / Math.tan((camera.fov * Math.PI) / 360)
    const halfWidth = (frame * aspect) / 2 - width * 0.04
    const left = box.max.x - halfWidth
    const right = box.min.x + halfWidth
    const x = left <= right ? Math.min(Math.max(opening, left), right) : (box.max.x + box.min.x) / 2
    camera.position.set(x, top - frame / 2, depth + distance)
    camera.lookAt(camera.position.x, camera.position.y, depth)
    camera.updateProjectionMatrix()
    // applyPose only reads refs; re-framing on every pose change would chase the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size.width, size.height, model])

  useFrame(
    (_, delta) => {
      shakeTime.current += Math.min(delta, 0.1)
      applyPose()
      if (facing.current) {
        facing.current.updateWorldMatrix(true, false)
        grasp.current.point
          .copy(hollow)
          .applyMatrix4(facing.current.matrixWorld)
          .add({ x: tuning.graspX, y: tuning.graspY, z: tuning.graspZ })
      }
      if (!ready.current) {
        ready.current = true
        onReady()
      }
    },
    { priority: 1 },
  )

  return (
    <group ref={sway}>
      <group ref={facing} quaternion={FACING} scale={MODEL_SCALE}>
        <primitive object={model} />
      </group>
    </group>
  )
}
