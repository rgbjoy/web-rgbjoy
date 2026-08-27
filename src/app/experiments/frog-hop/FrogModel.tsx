"use client"

import { useFrame, useLoader } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import {
  AnimationMixer,
  Group,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three"
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js"
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js"

import type { GamePhase } from "./game"

const MODEL_URL = "/models/frog/frog.fbx"
const BASE_COLOR_URL = "/models/frog/frog-basecolor.png"
const NORMAL_URL = "/models/frog/frog-normal.png"

const EXTRA_SKIN_WEIGHTS_WARNING =
  "THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights."

/**
 * WebGL supports four bone influences per vertex. FBXLoader already sorts the
 * influences, keeps the strongest four and normalises them; the source frog
 * simply makes it report that fallback for every fresh load. Keep other loader
 * warnings visible while silencing this one known, safely handled asset issue.
 */
class FrogFBXLoader extends FBXLoader {
  override parse(buffer: ArrayBuffer | string, path: string): Group {
    const warn = console.warn
    console.warn = (...args: unknown[]) => {
      if (args[0] !== EXTRA_SKIN_WEIGHTS_WARNING) warn(...args)
    }

    try {
      return super.parse(buffer, path)
    } finally {
      console.warn = warn
    }
  }
}

/** The FBX is authored in centimetres — roughly 343 units tall. */
const MODEL_SCALE = 0.0034
/** Corrects the model's rest facing onto the game's forward (-Z). */
const MODEL_YAW = Math.PI

/**
 * `metarig|jumpInPlace` — no horizontal travel, which is what we want since the
 * arc is code-driven. (`metarig|jump` translates ~890cm forward and would fight
 * `pointOnShot` for control of position.)
 */
const CLIP_NAME = "metarig|jumpInPlace"
/** Clip is 0.8s: launch at the head, apex ~0.4, touchdown by ~0.75. */
const CLIP_LAUNCH = 0.0
const CLIP_TOUCHDOWN = 0.76

const tempPosition = new Vector3()

export function FrogModel({
  phaseRef,
  progressRef,
}: {
  phaseRef: React.RefObject<GamePhase>
  /** 0→1 through the current hop, so the clip can be scrubbed in step with it. */
  progressRef: React.RefObject<number>
}) {
  const fbx = useLoader(FrogFBXLoader, MODEL_URL)
  const [baseColor, normal] = useLoader(TextureLoader, [
    BASE_COLOR_URL,
    NORMAL_URL,
  ])

  // Clone before configuring. `useLoader` caches one texture per URL, so
  // setting colorSpace on the original would leak into every other consumer —
  // and the React Compiler rejects mutating hook results regardless.
  const colorMap = useMemo(() => {
    const texture = baseColor.clone()
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }, [baseColor])

  useEffect(() => () => colorMap.dispose(), [colorMap])

  // Same reason: the loader hands back a shared instance. This must be
  // SkeletonUtils.clone — plain Object3D.clone() copies the SkinnedMesh but
  // leaves it bound to the *original* skeleton, and the copy renders collapsed
  // to nothing.
  const model = useMemo(() => {
    const clone = cloneSkeleton(fbx)

    clone.traverse((child) => {
      if (!(child as SkinnedMesh).isSkinnedMesh) return
      const mesh = child as SkinnedMesh
      // The contact blob makes jump height readable, but only the skinned
      // mesh's real shadow can project up the raised lip of a lily pad.
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.material = new MeshStandardMaterial({
        map: colorMap,
        normalMap: normal,
        roughness: 0.72,
        metalness: 0,
      })
    })

    return clone
  }, [fbx, colorMap, normal])

  const holderRef = useRef<Group>(null)
  const mixer = useMemo(() => new AnimationMixer(model), [model])

  // The clip lifts the body ~292cm at its apex. `pointOnShot` already owns the
  // frog's height, so that rise has to come back out or the hop doubles up.
  // There are no root position tracks — the lift comes from bone rotation — so
  // it can't be stripped from the clip and is instead cancelled every frame by
  // measuring the spine against its rest pose.
  const spine = useMemo(
    () => model.getObjectByName("spine") as Object3D | undefined,
    [model],
  )

  const restSpineY = useMemo(() => {
    const clip = fbx.animations.find((a) => a.name === CLIP_NAME)
    if (!clip || !spine) return 0
    const probe = new AnimationMixer(model)
    probe.clipAction(clip).play()
    probe.setTime(0)
    model.updateMatrixWorld(true)
    return model.worldToLocal(spine.getWorldPosition(new Vector3())).y
  }, [fbx, model, spine])

  useEffect(() => {
    const clip = fbx.animations.find((a) => a.name === CLIP_NAME)
    if (!clip) return
    const action = mixer.clipAction(clip)
    action.play()
    mixer.setTime(0)
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
    }
  }, [fbx, mixer, model])

  useFrame(() => {
    const phase = phaseRef.current
    // Scrub rather than let the clip run free: the hop's duration varies with
    // power, so the pose has to track the arc's progress, not wall-clock time.
    const time =
      phase === "shooting"
        ? CLIP_LAUNCH +
          progressRef.current * (CLIP_TOUCHDOWN - CLIP_LAUNCH)
        : phase === "landed"
          ? CLIP_TOUCHDOWN
          : 0

    mixer.setTime(time)

    const holder = holderRef.current
    if (!holder || !spine) return
    model.updateMatrixWorld(true)
    const lift = model.worldToLocal(spine.getWorldPosition(tempPosition)).y
    holder.position.y = -(lift - restSpineY) * MODEL_SCALE
  })

  return (
    <group ref={holderRef}>
      <primitive object={model} scale={MODEL_SCALE} rotation={[0, MODEL_YAW, 0]} />
    </group>
  )
}
