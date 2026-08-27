"use client"

import { EffectComposer } from "@react-three/postprocessing"
import { useFrame } from "@react-three/fiber"
import { Suspense, useLayoutEffect, useMemo, useRef } from "react"

import { RadialEdgeBlur } from "./RadialEdgeBlur"
import {
  CanvasTexture,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  RepeatWrapping,
  Vector3,
} from "three"
import type { Group, Texture } from "three"

const TUNNEL_RADIUS = 2.6
const TUNNEL_APOTHEM = TUNNEL_RADIUS * Math.cos(Math.PI / 8)
const FACE_WIDTH = 2 * TUNNEL_RADIUS * Math.sin(Math.PI / 8)
const SEGMENT_LENGTH = 4.8
const SEGMENT_COUNT = 48
const PANEL_GAP = 0.42
const PANEL_DEPTH = 0.06
const PANEL_INSET = 0.08
const PANEL_WIDTH_RATIO = 0.22
const PANELS_PER_SEGMENT = 2
const TRAVEL_SPEED = 2.4

const TUNNEL_LENGTH = SEGMENT_LENGTH * SEGMENT_COUNT
const panelPitch = SEGMENT_LENGTH / PANELS_PER_SEGMENT
const panelHeight = panelPitch - PANEL_GAP
const panelWidth = FACE_WIDTH * PANEL_WIDTH_RATIO

const faceCount = 8
const panelsPerFace = PANELS_PER_SEGMENT * SEGMENT_COUNT
const totalPanels = panelsPerFace * faceCount

const tunnelCenter = new Vector3()
const faceNormal = new Vector3()
const faceTangent = new Vector3()
const faceBitangent = new Vector3(0, 0, 1)
const panelPosition = new Vector3()
const panelQuaternion = new Quaternion()
const panelMatrix = new Matrix4()
const dummy = new Object3D()

type TunnelFace = {
  centerX: number
  centerY: number
  quaternion: Quaternion
}

function makeTunnelFaces(): TunnelFace[] {
  const faces: TunnelFace[] = []

  for (let i = 0; i < faceCount; i += 1) {
    const angle = Math.PI / 2 - (i * Math.PI * 2) / faceCount
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)

    const centerX = -nx * TUNNEL_APOTHEM
    const centerY = -ny * TUNNEL_APOTHEM

    setFaceBasis({ centerX, centerY })

    faces.push({
      centerX,
      centerY,
      quaternion: new Quaternion().setFromRotationMatrix(
        panelMatrix.makeBasis(faceTangent, faceBitangent, faceNormal),
      ),
    })
  }

  return faces
}

function setFaceBasis(face: Pick<TunnelFace, "centerX" | "centerY">) {
  faceNormal.set(-face.centerX, -face.centerY, 0).normalize()
  faceTangent.set(-faceNormal.y, faceNormal.x, 0).normalize()
}

function makePanelSurfaceTextures() {
  const size = 256
  const roughnessCanvas = document.createElement("canvas")
  const bumpCanvas = document.createElement("canvas")
  roughnessCanvas.width = size
  roughnessCanvas.height = size
  bumpCanvas.width = size
  bumpCanvas.height = size

  const roughnessCtx = roughnessCanvas.getContext("2d")
  const bumpCtx = bumpCanvas.getContext("2d")
  if (!roughnessCtx || !bumpCtx) {
    return { roughnessMap: null, bumpMap: null }
  }

  const roughnessData = roughnessCtx.createImageData(size, size)
  const bumpData = bumpCtx.createImageData(size, size)

  for (let i = 0; i < roughnessData.data.length; i += 4) {
    const grain = Math.random()
    const roughness = Math.floor((0.58 + grain * 0.34) * 255)
    const bump = Math.floor((0.42 + grain * 0.22) * 255)

    roughnessData.data[i] = roughness
    roughnessData.data[i + 1] = roughness
    roughnessData.data[i + 2] = roughness
    roughnessData.data[i + 3] = 255

    bumpData.data[i] = bump
    bumpData.data[i + 1] = bump
    bumpData.data[i + 2] = bump
    bumpData.data[i + 3] = 255
  }

  roughnessCtx.putImageData(roughnessData, 0, 0)
  bumpCtx.putImageData(bumpData, 0, 0)

  const configure = (texture: Texture) => {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(5, 10)
    texture.needsUpdate = true
  }

  const roughnessMap = new CanvasTexture(roughnessCanvas)
  const bumpMap = new CanvasTexture(bumpCanvas)
  configure(roughnessMap)
  configure(bumpMap)

  return { roughnessMap, bumpMap }
}

function fillPanelMatrices(matrices: Matrix4[], faces: TunnelFace[]) {
  let index = 0
  const tunnelStart = -TUNNEL_LENGTH / 2 + PANEL_INSET + panelHeight / 2

  for (const face of faces) {
    setFaceBasis(face)
    panelQuaternion.copy(face.quaternion)

    for (let panel = 0; panel < panelsPerFace; panel += 1) {
      const alongTunnel = tunnelStart + panel * panelPitch

      tunnelCenter.set(face.centerX, face.centerY, 0)

      panelPosition
        .copy(tunnelCenter)
        .addScaledVector(faceBitangent, alongTunnel)
        .addScaledVector(faceNormal, PANEL_DEPTH * 0.5)

      dummy.position.copy(panelPosition)
      dummy.quaternion.copy(panelQuaternion)
      dummy.scale.set(panelWidth, panelHeight, PANEL_DEPTH)
      dummy.updateMatrix()
      matrices[index].copy(dummy.matrix)
      index += 1
    }
  }
}

function TunnelWalls({ faces }: { faces: TunnelFace[] }) {
  const segments = useMemo(() => {
    return Array.from({ length: SEGMENT_COUNT }, (_, segment) => {
      const z =
        segment * SEGMENT_LENGTH - (SEGMENT_COUNT * SEGMENT_LENGTH) / 2

      return faces.map((face, faceIndex) => ({
        key: `${segment}-${faceIndex}`,
        face,
        z,
      }))
    }).flat()
  }, [faces])

  return (
    <group>
      {segments.map((segment) => (
          <mesh
            key={segment.key}
            position={[segment.face.centerX, segment.face.centerY, segment.z]}
            quaternion={segment.face.quaternion}
          >
            <planeGeometry args={[FACE_WIDTH, SEGMENT_LENGTH]} />
            <meshBasicMaterial color="#f6f6f6" toneMapped={false} />
          </mesh>
      ))}
    </group>
  )
}

function TunnelPanels({ faces }: { faces: TunnelFace[] }) {
  const meshRef = useRef<InstancedMesh>(null)
  const textures = useMemo(() => makePanelSurfaceTextures(), [])
  const matrices = useMemo(
    () => Array.from({ length: totalPanels }, () => new Matrix4()),
    [],
  )

  useLayoutEffect(() => {
    return () => {
      textures.roughnessMap?.dispose()
      textures.bumpMap?.dispose()
    }
  }, [textures])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    fillPanelMatrices(matrices, faces)
    matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [faces, matrices])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, totalPanels]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#0a0a0a"
        metalness={0}
        roughness={1}
        roughnessMap={textures.roughnessMap ?? undefined}
        bumpMap={textures.bumpMap ?? undefined}
        bumpScale={0.08}
        envMapIntensity={0}
      />
    </instancedMesh>
  )
}

function TunnelEndGlow() {
  return (
    <mesh position={[0, 0, -42]}>
      <planeGeometry args={[TUNNEL_RADIUS * 3.2, TUNNEL_RADIUS * 3.2]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </mesh>
  )
}

export function SpaceRoadScene() {
  const tunnelRef = useRef<Group>(null)
  const faces = useMemo(() => makeTunnelFaces(), [])

  useFrame((_, delta) => {
    const tunnel = tunnelRef.current
    if (!tunnel) return

    tunnel.position.z += TRAVEL_SPEED * delta

    if (tunnel.position.z > SEGMENT_LENGTH) {
      tunnel.position.z -= SEGMENT_LENGTH
    }
  })

  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <fogExp2 attach="fog" args={["#ffffff", 0.028]} />
      <ambientLight intensity={0.3} color="#ffffff" />

      <group ref={tunnelRef}>
        <TunnelWalls faces={faces} />
        <TunnelPanels faces={faces} />
      </group>

      <TunnelEndGlow />

      <Suspense fallback={null}>
        <EffectComposer multisampling={0}>
          <RadialEdgeBlur strength={4} radius={0.32} feather={0.16} />
        </EffectComposer>
      </Suspense>
    </>
  )
}
