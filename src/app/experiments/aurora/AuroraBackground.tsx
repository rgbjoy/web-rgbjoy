"use client"

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy"
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber"
import GUI from "lil-gui"
import React, { type FC, memo, useEffect, useRef } from "react"
import { ShaderMaterial, Vector2 } from "three"

import fragmentShader from "./aurora.frag"
import vertexShader from "../../utilities/shaders/gradient.vert"

import styles from "./AuroraBackground.module.css"

type Uniforms = {
  uTime: number
  uResolution: Vector2
  uTimeScale: number
  uSpinY: number
  uTumbleX: number
  uCameraZ: number
  uSphereRadius: number
  uIntensity: number
  uColorScale: number
  uFadeDistance: number
  uSteps: number
  uPulseStrength: number
  uPulseSpeed: number
  uPulseFreq: number
  uPulseFalloff: number
  uLineThickness: number
  uLineLength: number
}

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uTimeScale: 1,
  uSpinY: 0.35,
  uTumbleX: 0.18,
  uCameraZ: 2,
  uSphereRadius: 0.3,
  uIntensity: 0.05,
  uColorScale: 3,
  uFadeDistance: 5,
  uSteps: 44,
  uPulseStrength: 0.04,
  uPulseSpeed: 1.2,
  uPulseFreq: 4,
  uPulseFalloff: 0.55,
  uLineThickness: 0.01,
  uLineLength: 0.7,
}

const AuroraMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
)

extend({ AuroraMaterial })

declare module "@react-three/fiber" {
  interface ThreeElements {
    auroraMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>
  }
}

const ShaderAurora: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null)
  const { size } = useThree()

  const paramsRef = useRef({
    timeScale: INITIAL_UNIFORMS.uTimeScale,
    spinY: INITIAL_UNIFORMS.uSpinY,
    tumbleX: INITIAL_UNIFORMS.uTumbleX,
    cameraZ: INITIAL_UNIFORMS.uCameraZ,
    sphereRadius: INITIAL_UNIFORMS.uSphereRadius,
    intensity: INITIAL_UNIFORMS.uIntensity,
    colorScale: INITIAL_UNIFORMS.uColorScale,
    fadeDistance: INITIAL_UNIFORMS.uFadeDistance,
    steps: INITIAL_UNIFORMS.uSteps,
    pulseStrength: INITIAL_UNIFORMS.uPulseStrength,
    pulseSpeed: INITIAL_UNIFORMS.uPulseSpeed,
    pulseFreq: INITIAL_UNIFORMS.uPulseFreq,
    pulseFalloff: INITIAL_UNIFORMS.uPulseFalloff,
    lineThickness: INITIAL_UNIFORMS.uLineThickness,
    lineLength: INITIAL_UNIFORMS.uLineLength,
  })

  useEffect(() => {
    const gui = new GUI({ title: "Aurora" })

    const syncMaterial = () => {
      const mat = materialRef.current
      const p = paramsRef.current
      if (!mat) return

      mat.uTimeScale = p.timeScale
      mat.uSpinY = p.spinY
      mat.uTumbleX = p.tumbleX
      mat.uCameraZ = p.cameraZ
      mat.uSphereRadius = p.sphereRadius
      mat.uIntensity = p.intensity
      mat.uColorScale = p.colorScale
      mat.uFadeDistance = p.fadeDistance
      mat.uSteps = p.steps
      mat.uPulseStrength = p.pulseStrength
      mat.uPulseSpeed = p.pulseSpeed
      mat.uPulseFreq = p.pulseFreq
      mat.uPulseFalloff = p.pulseFalloff
      mat.uLineThickness = p.lineThickness
      mat.uLineLength = p.lineLength
    }

    const motion = gui.addFolder("Motion")
    motion.add(paramsRef.current, "timeScale", 0, 3, 0.01).name("Time scale").onChange(syncMaterial)
    motion.add(paramsRef.current, "spinY", 0, 1.5, 0.01).name("Spin Y").onChange(syncMaterial)
    motion.add(paramsRef.current, "tumbleX", 0, 1.5, 0.01).name("Tumble X").onChange(syncMaterial)
    motion.open()

    const shape = gui.addFolder("Shape")
    shape.add(paramsRef.current, "cameraZ", 0.5, 5, 0.01).name("Camera Z").onChange(syncMaterial)
    shape
      .add(paramsRef.current, "sphereRadius", 0.05, 1.2, 0.01)
      .name("Sphere")
      .onChange(syncMaterial)
    shape.add(paramsRef.current, "steps", 8, 64, 1).name("Steps").onChange(syncMaterial)

    const look = gui.addFolder("Look")
    look.add(paramsRef.current, "intensity", 0.01, 0.2, 0.001).name("Intensity").onChange(syncMaterial)
    look
      .add(paramsRef.current, "colorScale", 0.5, 8, 0.01)
      .name("Color scale")
      .onChange(syncMaterial)
    look
      .add(paramsRef.current, "fadeDistance", 1, 12, 0.1)
      .name("Fade distance")
      .onChange(syncMaterial)
    look.open()

    const pulse = gui.addFolder("Pulse")
    pulse
      .add(paramsRef.current, "pulseStrength", 0, 0.2, 0.001)
      .name("Strength")
      .onChange(syncMaterial)
    pulse.add(paramsRef.current, "pulseSpeed", 0, 4, 0.01).name("Speed").onChange(syncMaterial)
    pulse.add(paramsRef.current, "pulseFreq", 0.5, 12, 0.1).name("Rings").onChange(syncMaterial)
    pulse
      .add(paramsRef.current, "pulseFalloff", 0.1, 2, 0.01)
      .name("Falloff")
      .onChange(syncMaterial)
    pulse.open()

    const line = gui.addFolder("Line")
    line
      .add(paramsRef.current, "lineThickness", 0.001, 0.08, 0.001)
      .name("Thickness")
      .onChange(syncMaterial)
    line.add(paramsRef.current, "lineLength", 0, 1.5, 0.01).name("Length").onChange(syncMaterial)
    line.open()

    syncMaterial()

    let isHidden = true
    const setGuiHidden = (hidden: boolean) => {
      const el = gui.domElement
      if (!el) return
      isHidden = hidden
      el.style.display = hidden ? "none" : ""
    }
    setGuiHidden(true)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key.toLowerCase() !== "h") return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea") return
      if (target?.isContentEditable) return

      setGuiHidden(!isHidden)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      gui.destroy()
    }
  }, [])

  useFrame(({ elapsed }) => {
    if (!materialRef.current) return
    materialRef.current.uTime = elapsed

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height)
    }
  })

  return (
    <ScreenQuad>
      <auroraMaterial
        key={AuroraMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
      />
    </ScreenQuad>
  )
})

ShaderAurora.displayName = "ShaderAurora"

export const ShaderAuroraCanvas: FC = () => (
  <Canvas
    className={styles.canvas}
    gl={{ alpha: false, antialias: false }}
    style={{ background: "#000" }}
  >
    <ShaderAurora />
  </Canvas>
)
