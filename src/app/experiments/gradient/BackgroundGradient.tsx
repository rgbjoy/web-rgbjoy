"use client"

import { ScreenQuad, shaderMaterial } from "@react-three/drei"
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber"
import React, { type FC, useRef, memo } from "react"
import { Color, ShaderMaterial, Vector3 } from "three"

import fragmentShader from "./gradient.frag"
import vertexShader from "../../utilities/shaders/gradient.vert"

import styles from "./BackgroundGradient.module.css"

// Animated gradient background - full viewport, no scroll

type Uniforms = {
  uTime: number
  uAspectRatio: number
  uColourPalette: Vector3[]
  uUvScale: number
  uUvDistortionIterations: number
  uUvDistortionIntensity: number
}

const colourStopsToVectors = (colourStops: string[]) =>
  colourStops.map((colourStop) => {
    const color = new Color(colourStop)
    return new Vector3(color.r, color.g, color.b)
  })

const padToLen = <T,>(arr: T[], len: number, fallback: T) => {
  if (arr.length === 0) return Array.from({ length: len }, () => fallback)
  if (arr.length >= len) return arr.slice(0, len)
  const out = [...arr]
  while (out.length < len) out.push(out[out.length - 1])
  return out
}

export const DEFAULT_COLOUR_STOPS = ["#232323", "#BBBBBB", "#ffffff", "#000000"]
const PALETTE_SIZE = 4 // must match shader: `uniform vec3 uColourPalette[4];`

export const DEFAULT_COLOUR_PALETTE: Vector3[] = padToLen(
  colourStopsToVectors(DEFAULT_COLOUR_STOPS),
  PALETTE_SIZE,
  new Vector3(0, 0, 0),
)

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uAspectRatio: 1,
  uColourPalette: DEFAULT_COLOUR_PALETTE,
  uUvScale: 1,
  uUvDistortionIterations: 0,
  uUvDistortionIntensity: 0,
}

const GradientMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader
)

extend({ GradientMaterial })

declare module "@react-three/fiber" {
  interface ThreeElements {
    gradientMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
    Partial<Uniforms>
  }
}

type Config = {
  colourPalette: Vector3[]
  timeMultiplier: number
  scale: number
  distortionIterations: number
  distortionIntensity: number
}

const DEFAULT_CONFIG: Config = {
  colourPalette: DEFAULT_COLOUR_PALETTE,
  timeMultiplier: 0.1,
  scale: 1,
  distortionIterations: 6,
  distortionIntensity: 0.3,
}

export const ShaderGradient: FC<Config> = memo(
  ({
    colourPalette,
    timeMultiplier,
    scale,
    distortionIntensity,
    distortionIterations,
  }) => {
    const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null)
    const { size } = useThree()

    useFrame(({ clock }) => {
      if (!materialRef.current) return
      materialRef.current.uTime = clock.elapsedTime * timeMultiplier
      materialRef.current.uAspectRatio = size.width / size.height
    })

    return (
      <ScreenQuad>
        <gradientMaterial
          key={GradientMaterial.key}
          ref={materialRef}
          uTime={0}
          uAspectRatio={1}
          uColourPalette={colourPalette}
          uUvScale={scale}
          uUvDistortionIterations={distortionIterations}
          uUvDistortionIntensity={distortionIntensity}
        />
      </ScreenQuad>
    )
  }
)

ShaderGradient.displayName = "ShaderGradient"

export const ShaderGradientCanvas: FC = () => (
  <Canvas
    className={styles.canvas}
    gl={{ alpha: false, antialias: false }}
  >
    <ShaderGradient {...DEFAULT_CONFIG} />
  </Canvas>
)
