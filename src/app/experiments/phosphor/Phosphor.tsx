"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import GUI from "lil-gui"
import { memo, useEffect, useRef, type FC } from "react"
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three"

import blocksShader from "./blocks.frag"
import displayShader from "./display.frag"
import { BLOCK_FLOATS, compose, LOOKS, settle, writeBlocks, type Cut, type Look } from "./frames"

import styles from "./Phosphor.module.css"

/** Blocks the data texture holds: three busy frames at once, mid-cut. */
const MAX_BLOCKS = 384

/** Cuts kept on screen at once; clicking faster than they land drops the oldest. */
const MAX_CUTS = 3

/** The frame is painted at half the screen's resolution and scaled up, as video would be. */
const FRAME_SCALE = 0.5

/** Saved frames are this long on their long side: 4K, the references' size. */
const SAVE_SIZE = 3840

/** The mask was measured on the references, 2160 pixels on their short side. */
const REFERENCE_SHORT_SIDE = 2160

/** What the blocks are painted over before the first cut lands. */
const BACKGROUND = new Vector3(0.03, 0.028, 0.035)

const MASKS = { Slot: 1, Grille: 2, Off: 0 } as const

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

const SETTINGS = {
  look: "Mixed" as Look,
  autoCut: !reducedMotion,
  hold: 8,
  cutLength: 1.6,
  frameRate: 12,
  drift: reducedMotion ? 0 : 1,
  mask: "Slot" as keyof typeof MASKS,
  maskStrength: 0.4,
  maskSize: 1,
  glow: 0.25,
  grain: 0.05,
  banding: 0.03,
  vignette: 0.2,
}

const pickFrom = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

const roll = (min: number, max: number, step: number) =>
  Number((Math.round((min + Math.random() * (max - min)) / step) * step).toFixed(3))

/**
 * The dice: every setting but the look and auto cut, rerolled within ranges
 * that still read as a picture on a tube rather than the sliders' extremes.
 */
function rollDice() {
  SETTINGS.hold = roll(4, 14, 0.5)
  SETTINGS.cutLength = roll(0.6, 2.8, 0.05)
  SETTINGS.frameRate = pickFrom([0, 6, 8, 12, 12, 15, 24])
  if (!reducedMotion) SETTINGS.drift = roll(0, 2, 0.05)
  SETTINGS.mask = pickFrom(["Slot", "Slot", "Slot", "Grille", "Grille", "Off"] as const)
  SETTINGS.maskStrength = roll(0.2, 0.65, 0.01)
  SETTINGS.maskSize = roll(0.75, 2.5, 0.05)
  SETTINGS.glow = roll(0, 0.6, 0.01)
  SETTINGS.grain = roll(0.02, 0.12, 0.005)
  SETTINGS.banding = roll(0, 0.06, 0.005)
  SETTINGS.vignette = roll(0, 0.45, 0.01)
}

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position, 1.0); }
`

/** One triangle that covers the screen, drawn by itself in its own scene. */
function fullscreenPass(material: ShaderMaterial) {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  )
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new Scene()
  scene.add(mesh)
  return { scene, geometry }
}

/** Where the blocks are painted; mipmapped, so the display pass can read a halo off it. */
function frameTarget(width: number, height: number) {
  const target = new WebGLRenderTarget(width, height, {
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false,
  })
  target.texture.name = "Phosphor frame"
  return target
}

type Passes = {
  data: Float32Array
  blocks: DataTexture
  frame: WebGLRenderTarget
  paint: ShaderMaterial
  display: ShaderMaterial
  paintScene: Scene
  displayScene: Scene
  camera: OrthographicCamera
  dispose: () => void
}

function createPasses(): Passes {
  const data = new Float32Array(MAX_BLOCKS * BLOCK_FLOATS)
  const blocks = new DataTexture(data, (MAX_BLOCKS * BLOCK_FLOATS) / 4, 1, RGBAFormat, FloatType)
  blocks.minFilter = NearestFilter
  blocks.magFilter = NearestFilter
  blocks.needsUpdate = true

  const frame = frameTarget(1, 1)

  const paint = new ShaderMaterial({
    vertexShader,
    fragmentShader: blocksShader,
    uniforms: {
      uBlocks: { value: blocks },
      uCount: { value: 0 },
      uResolution: { value: new Vector2(1, 1) },
      uBackground: { value: BACKGROUND },
    },
    defines: { MAX_BLOCKS },
    depthTest: false,
    depthWrite: false,
  })

  const display = new ShaderMaterial({
    vertexShader,
    fragmentShader: displayShader,
    uniforms: {
      uImage: { value: frame.texture },
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uMask: { value: 1 },
      uMaskStrength: { value: 0 },
      uMaskCell: { value: new Vector2(8, 12) },
      uGlow: { value: 0 },
      uGrain: { value: 0 },
      uBanding: { value: 0 },
      uVignette: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })

  const paintQuad = fullscreenPass(paint)
  const displayQuad = fullscreenPass(display)

  return {
    data,
    blocks,
    frame,
    paint,
    display,
    paintScene: paintQuad.scene,
    displayScene: displayQuad.scene,
    camera: new OrthographicCamera(),
    dispose: () => {
      blocks.dispose()
      frame.dispose()
      paint.dispose()
      display.dispose()
      paintQuad.geometry.dispose()
      displayQuad.geometry.dispose()
    },
  }
}

/** Paints the blocks on screen at `time` into `target`. */
function paintFrame(
  renderer: WebGLRenderer,
  pass: Passes,
  cuts: readonly Cut[],
  time: number,
  target: WebGLRenderTarget,
) {
  const u = pass.paint.uniforms
  u.uCount.value = writeBlocks(pass.data, cuts, time, SETTINGS.cutLength, SETTINGS.drift)
  u.uResolution.value.set(target.width, target.height)
  pass.blocks.needsUpdate = true
  renderer.setRenderTarget(target)
  renderer.render(pass.paintScene, pass.camera)
}

type Show = {
  frame: WebGLRenderTarget
  out: WebGLRenderTarget | null
  width: number
  height: number
  time: number
  seed: number
  /** Device pixels to a pixel of the 4K references. */
  maskScale: number
}

/** Puts a painted frame on the tube: onto the screen, or into `out` to save. */
function showFrame(renderer: WebGLRenderer, pass: Passes, show: Show) {
  const u = pass.display.uniforms
  const scale = show.maskScale * SETTINGS.maskSize
  u.uImage.value = show.frame.texture
  u.uResolution.value.set(show.width, show.height)
  u.uTime.value = show.time
  u.uSeed.value = (show.seed % 997) + 0.5
  u.uMask.value = MASKS[SETTINGS.mask]
  u.uMaskStrength.value = SETTINGS.maskStrength
  u.uMaskCell.value.set(Math.max(3, Math.round(8 * scale)), Math.max(4, Math.round(12 * scale)))
  u.uGlow.value = SETTINGS.glow
  u.uGrain.value = SETTINGS.grain
  u.uBanding.value = SETTINGS.banding
  u.uVignette.value = SETTINGS.vignette
  renderer.setRenderTarget(show.out)
  renderer.render(pass.displayScene, pass.camera)
}

/** Renders the frame as it stands at 4K and downloads it as a PNG. */
async function savePng(
  renderer: WebGLRenderer,
  pass: Passes,
  cuts: readonly Cut[],
  time: number,
  seed: number,
) {
  const canvas = renderer.domElement
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
  const width = aspect >= 1 ? SAVE_SIZE : Math.round(SAVE_SIZE * aspect)
  const height = aspect >= 1 ? Math.round(SAVE_SIZE / aspect) : SAVE_SIZE
  const frame = frameTarget(Math.round(width * FRAME_SCALE), Math.round(height * FRAME_SCALE))
  const out = new WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false })
  try {
    paintFrame(renderer, pass, cuts, time, frame)
    showFrame(renderer, pass, {
      frame,
      out,
      width,
      height,
      time,
      seed,
      maskScale: Math.min(width, height) / REFERENCE_SHORT_SIDE,
    })
    const pixels = new Uint8Array(width * height * 4)
    await renderer.readRenderTargetPixelsAsync(out, 0, 0, width, height, pixels)

    // GL reads bottom row first; images start at the top.
    const image = new ImageData(width, height)
    const row = width * 4
    for (let y = 0; y < height; y++) {
      image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
    }
    const flat = document.createElement("canvas")
    flat.width = width
    flat.height = height
    flat.getContext("2d")?.putImageData(image, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => flat.toBlob(resolve, "image/png"))
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `phosphor-${seed}.png`
    link.click()
    // Safari starts the download after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    frame.dispose()
    out.dispose()
    renderer.setRenderTarget(null)
  }
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

const PhosphorScene: FC = memo(() => {
  const gl = useThree((state) => state.gl)
  const passes = useRef<Passes | null>(null)
  const cuts = useRef<Cut[]>([])
  const now = useRef(0)
  /** The frame time last painted; the blocks only move this often. */
  const paintedAt = useRef(-1)
  const repaint = useRef(true)
  const saving = useRef(false)
  const drawingSize = useRef(new Vector2())
  /** Mirrors the newest frame's seed for the panel; type one in to bring it back. */
  const panel = useRef({ seed: "" })
  /** Cuts to a new frame; set up with the panel, called by the frame loop too. */
  const cutRef = useRef(() => {})

  useEffect(() => {
    passes.current = createPasses()
    return () => {
      passes.current?.dispose()
      passes.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = gl.domElement
    const gui = new GUI({ title: "Phosphor" })
    const frames = gui.addFolder("Frames")
    const look = frames.add(SETTINGS, "look", LOOKS).name("Look")
    const seedField = frames.add(panel.current, "seed").name("Seed")

    const cut = (seed = newSeed()) => {
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
      const next = [...cuts.current, { frame: compose(seed, aspect, SETTINGS.look), start: now.current }]
      cuts.current = next.slice(-MAX_CUTS)
      panel.current.seed = String(seed)
      seedField.updateDisplay()
      repaint.current = true
    }

    const save = () => {
      const pass = passes.current
      const latest = cuts.current[cuts.current.length - 1]
      if (!pass || !latest || saving.current) return
      saving.current = true
      savePng(gl, pass, cuts.current, paintedAt.current, latest.frame.seed)
        .catch((error) => console.error("Phosphor: couldn't save the frame", error))
        .finally(() => {
          saving.current = false
          repaint.current = true
        })
    }
    // A new frame too, so the seed is part of the roll.
    const dice = () => {
      rollDice()
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay())
      cut()
    }
    cutRef.current = () => cut()

    look.onChange(() => cut())
    seedField.onFinishChange((value: string) => {
      const seed = Number.parseInt(value, 10)
      if (Number.isFinite(seed)) cut(seed >>> 0)
    })
    frames.add({ next: () => cut() }, "next").name("New frame (click)")
    frames.add({ dice }, "dice").name("Roll the dice (R)")
    frames.add({ save }, "save").name("Save 4K PNG (S)")
    frames.add(SETTINGS, "autoCut").name("Auto cut")
    frames.add(SETTINGS, "hold", 2, 30, 0.5).name("Hold (s)")
    frames.add(SETTINGS, "cutLength", 0, 4, 0.05).name("Cut length (s)")
    frames.add(SETTINGS, "frameRate", 0, 30, 1).name("Frame rate (0 smooth)")
    frames.add(SETTINGS, "drift", 0, 3, 0.05).name("Drift")

    const screen = gui.addFolder("Screen")
    screen.add(SETTINGS, "mask", Object.keys(MASKS)).name("Mask")
    screen.add(SETTINGS, "maskStrength", 0, 1, 0.01).name("Mask strength")
    screen.add(SETTINGS, "maskSize", 0.5, 4, 0.05).name("Mask size")
    screen.add(SETTINGS, "glow", 0, 1, 0.01).name("Glow")
    screen.add(SETTINGS, "grain", 0, 0.2, 0.005).name("Grain")
    screen.add(SETTINGS, "banding", 0, 0.1, 0.005).name("Banding")
    screen.add(SETTINGS, "vignette", 0, 0.8, 0.01).name("Vignette")

    let hidden = true
    const setHidden = (value: boolean) => {
      hidden = value
      gui.domElement.style.display = value ? "none" : ""
    }
    setHidden(true)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return

      const key = event.key.toLowerCase()
      if (key === "h") setHidden(!hidden)
      else if (key === "s") save()
      else if (key === "r") dice()
      else if (key === " " || key === "n") {
        event.preventDefault()
        cut()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) cut()
    }

    window.addEventListener("keydown", onKeyDown)
    canvas.addEventListener("pointerdown", onPointerDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      canvas.removeEventListener("pointerdown", onPointerDown)
      gui.destroy()
    }
  }, [gl])

  useFrame(
    ({ gl: renderer, elapsed, viewport }) => {
      const pass = passes.current
      if (!pass) return
      now.current = elapsed

      const latest = cuts.current[cuts.current.length - 1]
      if (!latest || (SETTINGS.autoCut && elapsed - latest.start >= SETTINGS.cutLength + SETTINGS.hold)) {
        cutRef.current()
      }
      cuts.current = settle(cuts.current, elapsed, SETTINGS.cutLength)

      renderer.getDrawingBufferSize(drawingSize.current)
      const { x: width, y: height } = drawingSize.current
      const frameWidth = Math.max(1, Math.round(width * FRAME_SCALE))
      const frameHeight = Math.max(1, Math.round(height * FRAME_SCALE))
      if (pass.frame.width !== frameWidth || pass.frame.height !== frameHeight) {
        pass.frame.setSize(frameWidth, frameHeight)
        repaint.current = true
      }

      // The blocks move at the frame rate of cheap video; the grain at the screen's.
      const rate = SETTINGS.frameRate
      const frameTime = rate > 0 ? Math.floor(elapsed * rate) / rate : elapsed
      if (repaint.current || frameTime !== paintedAt.current) {
        paintFrame(renderer, pass, cuts.current, frameTime, pass.frame)
        paintedAt.current = frameTime
        repaint.current = false
      }

      showFrame(renderer, pass, {
        frame: pass.frame,
        out: null,
        width,
        height,
        time: reducedMotion ? 0 : elapsed,
        seed: cuts.current[cuts.current.length - 1]?.frame.seed ?? 0,
        // A brick at least four CSS pixels wide, so the mask still reads on dense phone screens.
        maskScale: Math.max(Math.min(width, height) / REFERENCE_SHORT_SIDE, viewport.dpr / 2),
      })
    },
    // The render phase runs after every update; a job here replaces R3F's default render.
    { phase: "render" },
  )

  return null
})

PhosphorScene.displayName = "PhosphorScene"

export const PhosphorCanvas: FC = () => (
  <Canvas
    className={styles.canvas}
    dpr={[1, 2]}
    gl={{ alpha: false, antialias: false, powerPreference: "high-performance" }}
  >
    <PhosphorScene />
  </Canvas>
)
