"use client"

import { ScreenQuad } from "@react-three/drei/legacy"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import GUI from "lil-gui"
import { memo, useEffect, useMemo, useRef, type FC } from "react"
import { ShaderMaterial, Vector2, Vector3 } from "three"

import fragmentShader from "./frostedGlass.frag"
import vertexShader from "../../utilities/shaders/gradient.vert"
import {
  createSimulation,
  DEFAULT_SLAB_DEPTH,
  FLOOR_Y,
  HALF_HEIGHT,
  MAX_GRAINS,
  MAX_SLAB_DEPTH,
  MIN_SLAB_DEPTH,
  type Simulation,
} from "./simulation"

import styles from "./FrostedGlass.module.css"

const DEFAULT_COUNT = 44

/**
 * Parses "#rrggbb" straight to 0-1 components. three only applies its
 * colour-space conversion to shaders that include the chunk, and this one writes
 * to the framebuffer untouched — so these are display values, not linear ones.
 */
function paneColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)

  return new Vector3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  )
}

const LOOK = {
  ink: "#2b2e2f",
  glassTop: "#eff1ee",
  glassBottom: "#dfe2df",
  blurNear: 0.02,
  blurPerDepth: 0.062,
  haze: 0.3,
  deepDensity: 0.45,
  frost: 0.028,
  grain: 0.007,
}

const MOTION = {
  count: DEFAULT_COUNT,
  depth: DEFAULT_SLAB_DEPTH,
  gravity: 7.4,
  dropInterval: 1.1,
  knock: 3.2,
}

type SceneProps = { onReady: () => void }

const FrostedGlassScene: FC<SceneProps> = memo(({ onReady }) => {
  const materialRef = useRef<ShaderMaterial>(null)
  const simulationRef = useRef<Simulation | null>(null)
  const rebuildRef = useRef<((count: number) => void) | null>(null)
  /** Last aspect the walls were placed for. A resize moves them; it does not
   *  rebuild the pile, so this is tracked in the frame loop rather than as a
   *  React dependency. */
  const aspectRef = useRef(1)
  const { gl } = useThree()

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uHalfHeight: { value: HALF_HEIGHT },
      uFloorY: { value: FLOOR_Y },
      uCount: { value: 0 },
      uSegA: { value: new Float32Array(MAX_GRAINS * 4) },
      uSegB: { value: new Float32Array(MAX_GRAINS * 4) },
      uBlurNear: { value: LOOK.blurNear },
      uBlurPerDepth: { value: LOOK.blurPerDepth },
      uHaze: { value: LOOK.haze },
      uMinDensity: { value: LOOK.deepDensity },
      uGrain: { value: LOOK.grain },
      uFrost: { value: LOOK.frost },
      uInk: { value: paneColor(LOOK.ink) },
      uGlassTop: { value: paneColor(LOOK.glassTop) },
      uGlassBottom: { value: paneColor(LOOK.glassBottom) },
    }),
    [],
  )

  // The WASM module loads once; rebuilding the field for a new grain count only
  // recreates the world on top of it.
  useEffect(() => {
    let disposed = false

    const canvas = gl.domElement
    aspectRef.current = canvas.clientWidth / Math.max(canvas.clientHeight, 1)

    const build = async () => {
      const { default: Box3DFactory } = await import("box3d.js/inline")
      const b3 = await Box3DFactory()
      if (disposed) return

      const create = (count: number) =>
        createSimulation(b3, {
          count,
          aspect: aspectRef.current,
          depth: MOTION.depth,
        })

      simulationRef.current = create(MOTION.count)
      rebuildRef.current = (count: number) => {
        simulationRef.current?.dispose()
        const next = create(count)
        next.setGravity(MOTION.gravity)
        next.setDropInterval(MOTION.dropInterval)
        next.setKnockStrength(MOTION.knock)
        simulationRef.current = next
      }
      onReady()
    }

    void build().catch((error) => {
      // The pane still renders without physics; say why it is empty.
      console.error("Frosted Glass: physics failed to load", error)
      onReady()
    })

    return () => {
      disposed = true
      simulationRef.current?.dispose()
      simulationRef.current = null
      rebuildRef.current = null
    }
  }, [gl, onReady])

  useEffect(() => {
    const canvas = gl.domElement

    const knock = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const x =
        ((event.clientX - rect.left) / rect.width - 0.5) *
        2 *
        HALF_HEIGHT *
        (rect.width / rect.height)
      const y = (0.5 - (event.clientY - rect.top) / rect.height) * 2 * HALF_HEIGHT

      simulationRef.current?.knock(x, y)
    }

    canvas.addEventListener("pointerdown", knock)
    return () => canvas.removeEventListener("pointerdown", knock)
  }, [gl])

  useEffect(() => {
    const gui = new GUI({ title: "Frosted Glass" })

    const sync = () => {
      const material = materialRef.current
      if (!material) return

      material.uniforms.uBlurNear.value = LOOK.blurNear
      material.uniforms.uBlurPerDepth.value = LOOK.blurPerDepth
      material.uniforms.uHaze.value = LOOK.haze
      material.uniforms.uMinDensity.value = LOOK.deepDensity
      material.uniforms.uFrost.value = LOOK.frost
      material.uniforms.uGrain.value = LOOK.grain
      material.uniforms.uInk.value.copy(paneColor(LOOK.ink))
      material.uniforms.uGlassTop.value.copy(paneColor(LOOK.glassTop))
      material.uniforms.uGlassBottom.value.copy(paneColor(LOOK.glassBottom))
    }

    const depth = gui.addFolder("Depth")
    depth.add(LOOK, "blurNear", 0, 0.08, 0.001).name("Blur at the pane").onChange(sync)
    depth.add(LOOK, "blurPerDepth", 0, 0.3, 0.001).name("Blur per metre").onChange(sync)
    depth.add(LOOK, "haze", 0, 1, 0.01).name("Haze").onChange(sync)
    depth.add(LOOK, "deepDensity", 0, 1, 0.01).name("Deepest ink").onChange(sync)
    depth.open()

    const glass = gui.addFolder("Glass")
    glass.addColor(LOOK, "ink").name("Ink").onChange(sync)
    glass.addColor(LOOK, "glassTop").name("Top").onChange(sync)
    glass.addColor(LOOK, "glassBottom").name("Bottom").onChange(sync)
    glass.add(LOOK, "frost", 0, 0.3, 0.005).name("Frost").onChange(sync)
    glass.add(LOOK, "grain", 0, 0.03, 0.001).name("Grain").onChange(sync)

    const box = gui.addFolder("Box")
    box
      .add(MOTION, "depth", MIN_SLAB_DEPTH, MAX_SLAB_DEPTH, 0.1)
      .name("Wall distance")
      .onChange((value: number) => simulationRef.current?.setDepth(value))
    box.open()

    const fall = gui.addFolder("Fall")
    fall
      .add(MOTION, "count", 6, MAX_GRAINS, 1)
      .name("Grains")
      // Repacking the sill means a fresh world, so wait for the drag to end.
      .onFinishChange((value: number) => rebuildRef.current?.(value))
    fall
      .add(MOTION, "gravity", 1, 20, 0.1)
      .name("Gravity")
      .onChange((value: number) => simulationRef.current?.setGravity(value))
    fall
      .add(MOTION, "dropInterval", 0.2, 6, 0.1)
      .name("Seconds between drops")
      .onChange((value: number) => simulationRef.current?.setDropInterval(value))
    fall
      .add(MOTION, "knock", 0, 10, 0.1)
      .name("Knock")
      .onChange((value: number) => simulationRef.current?.setKnockStrength(value))
    fall.open()

    sync()

    let hidden = true
    const setHidden = (value: boolean) => {
      hidden = value
      gui.domElement.style.display = value ? "none" : ""
    }
    setHidden(true)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "h") return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return

      setHidden(!hidden)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      gui.destroy()
    }
  }, [])

  useFrame((state, delta) => {
    const material = materialRef.current
    const simulation = simulationRef.current
    if (!material) return

    material.uniforms.uTime.value = state.elapsed
    material.uniforms.uResolution.value.set(state.size.width, state.size.height)

    const aspect = state.size.width / Math.max(state.size.height, 1)

    if (simulation) {
      // Only on a real change: resize wakes the whole field, and a field that
      // never sleeps never settles.
      if (Math.abs(aspect - aspectRef.current) > 0.001) {
        aspectRef.current = aspect
        simulation.resize(aspect)
      }

      simulation.step(delta)
      material.uniforms.uCount.value = simulation.write(
        material.uniforms.uSegA.value,
        material.uniforms.uSegB.value,
      )
    }
  })

  return (
    <ScreenQuad>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        defines={{ MAX_GRAINS }}
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
})

FrostedGlassScene.displayName = "FrostedGlassScene"

export const FrostedGlassCanvas: FC<SceneProps> = ({ onReady }) => (
  <Canvas
    className={styles.canvas}
    dpr={[1, 1.75]}
    gl={{ alpha: false, antialias: false }}
  >
    <FrostedGlassScene onReady={onReady} />
  </Canvas>
)
