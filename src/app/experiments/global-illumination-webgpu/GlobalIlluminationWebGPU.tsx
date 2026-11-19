"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import GUI from "lil-gui"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from "react"
import { Color, Matrix3, Matrix4, Scene, Vector3 } from "three"

import { Accumulator, cameraMoved, type FrameMode } from "./accumulation"
import { Controls } from "./Controls"
import { ProbeSchedule, randomRotation } from "./probes"
import { inverseTurn, OBJECTS, pickHit, resetObjects } from "./room"
import type { CanvasProps } from "./Viewer"
import type { SceneUniforms } from "./layout"
import { GpuPasses, type Timings } from "./passes"
import { PLUS_CENTER, plusHit, plusTurn } from "./plus"
import { AdaptiveScale } from "./quality"

import styles from "./page.module.css"

/** Frames averaged at rest before the image counts as settled and tracing stops. */
const SAMPLE_LIMIT = 512
/** The probe volume's image has no noise to average away, only edges to antialias. */
const PROBE_SAMPLE_LIMIT = 96

/** Probe updates after a change before the volume counts as settled and stops. */
const PROBE_LIMIT = 120
/** While the plus turns the probes never settle: each update counts at least
 *  this much, so they follow it a few frames behind. */
const PROBE_FOLLOW = 0.1
/** While the plus turns and the camera holds still, how much of each frame
 *  goes into the air: enough memory to hide its march's jitter, short enough
 *  to keep up with the plus's shadow in the shaft. */
const AIR_FOLLOW = 0.25

/** Emissive intensity is in the panel's units; this brings it to scene radiance. */
const EMISSIVE_SCALE = 0.1

const METHODS = { "Path traced": 0, "Probe volume": 1 } as const
const SAMPLING = { "White noise": 0, "Blue noise": 1 } as const
const MARCH_STEPS = [4, 8, 16, 32, 64]
const VOLUME_STEPS = [8, 16, 32, 64]
const MODES: Record<FrameMode, number> = { fresh: 0, rest: 1, moving: 2 }
/** Past 1.5 the float history (128 bytes a pixel) outgrows what most GPUs have to give. */
const PIXEL_RATIOS = [1, 1.25, 1.5]

const SETTINGS = {
  emissiveColor: "#f2701f",
  emissiveIntensity: 7,
  lightX: 14,
  lightY: 5.2,
  lightZ: 1.7,
  shadowSoftness: 0.1,
  ambient: 0.02,
  accumulate: true,
  denoise: true,
  method: "Path traced" as keyof typeof METHODS,
  probeRays: 64,
  sampling: "Blue noise" as keyof typeof SAMPLING,
  bounces: 2,
  marchSteps: 32,
  marchJitter: true,
  volumetrics: true,
  volumeSteps: 32,
  volumeDensity: 0.014,
  exposure: 0.9,
  bloom: 1.2,
  bloomThreshold: 0.9,
  bloomRadius: 1.2,
  // Every pixel is traced; the accumulated jitter antialiases what the
  // lower ratio gives up, and a frame stays within a 120 Hz screen's 8 ms.
  pixelRatio: 1,
  /** Trace below the ratio on a GPU that can't keep up. */
  adaptive: true,
  spin: true,
  /** Radians a second about its upright. */
  spinSpeed: 0.6,
  localRefresh: true,
}

/** Where the orbit starts: inside, looking across the room at the window wall. */
const CAMERA = {
  position: new Vector3(-2.2, 2.7, 5.2),
  target: new Vector3(0.4, 1.3, -1.6),
  /** Vertical field of view on a landscape screen. */
  fov: 52,
  /** Narrow screens widen the view until at least this much fits across. */
  minHorizontalFov: 58,
}

const UNSUPPORTED = "This experiment runs on WebGPU, which this browser doesn't offer."
const FAILED = "WebGPU couldn't set the room up on this device."

const emissive = new Color()

/** How many frames the current method needs averaged at rest. */
const sampleLimit = () => (SETTINGS.method === "Probe volume" ? PROBE_SAMPLE_LIMIT : SAMPLE_LIMIT)

/** The GPU behind the overlay's renderer, when it really is WebGPU and not three's WebGL 2 fallback. */
function webgpuDevice(renderer: unknown): GPUDevice | null {
  const backend = (renderer as { backend?: { isWebGPUBackend?: boolean; device?: GPUDevice | null } } | null)?.backend
  return backend?.isWebGPUBackend && backend.device ? backend.device : null
}

/** Copies where the objects are into the scene's uniforms. */
function applyObjects(scene: SceneUniforms) {
  scene.glowCenter.copy(OBJECTS.glow.position)
  scene.pebbleCenter.copy(OBJECTS.pebble.position)
  scene.blockCenter.copy(OBJECTS.block.position)
  inverseTurn("block", scene.blockInverse)
  scene.torusCenter.copy(OBJECTS.torus.position)
  inverseTurn("torus", scene.torusInverse)
}

/** Puts the plus where it turns, at its turn (local to world). */
function applyPlus(scene: SceneUniforms, turn: Matrix3) {
  scene.plusCenter.copy(PLUS_CENTER)
  scene.plusInverse.copy(turn).transpose()
}

/** Copies the panel's settings into the uniforms. */
function applySettings(passes: GpuPasses) {
  const scene = passes.scene
  emissive.set(SETTINGS.emissiveColor)
  scene.emissive
    .set(emissive.r, emissive.g, emissive.b)
    .multiplyScalar(SETTINGS.emissiveIntensity * EMISSIVE_SCALE)
  scene.lightPosition.set(SETTINGS.lightX, SETTINGS.lightY, SETTINGS.lightZ)
  scene.shadowSoftness = SETTINGS.shadowSoftness
  scene.ambient = SETTINGS.ambient
  passes.sceneChanged = true

  const frame = passes.frame
  frame.method = METHODS[SETTINGS.method]
  frame.localRefresh = SETTINGS.localRefresh
  frame.bounces = SETTINGS.bounces
  frame.sampling = SAMPLING[SETTINGS.sampling]
  frame.marchSteps = SETTINGS.marchSteps
  frame.marchJitter = SETTINGS.marchJitter ? 1 : 0
  frame.volumeSteps = SETTINGS.volumeSteps
  frame.volumeDensity = SETTINGS.volumetrics ? SETTINGS.volumeDensity : 0
  passes.probeUpdate.rays = SETTINGS.probeRays
}

const milliseconds = (value: number | null) => (value === null ? "idle" : `${value.toFixed(2)} ms`)

/** The frame time to hold: 12 ms of GPU work where the GPU times itself, or
 *  else a 60 Hz frame between draws, which a vsynced page can't beat anyway. */
const qualityFor = (timed: boolean) => new AdaptiveScale(timed ? 12 : 1000 / 60)

type SceneProps = CanvasProps & {
  /** Where the traced picture goes, under the overlay this scene draws the gizmo on. */
  canvas: HTMLCanvasElement
  onError: (message: string) => void
}

const GlobalIlluminationScene: FC<SceneProps> = memo(
  ({ canvas, onError, onReady, selected, mode, onSelect, onMove }) => {
    const renderer = useThree((state) => state.renderer)
    const invalidate = useThree((state) => state.invalidate)
    const passes = useRef<GpuPasses | null>(null)
    const accumulator = useRef(new Accumulator(sampleLimit()))
    const probeSchedule = useRef(new ProbeSchedule(PROBE_LIMIT))
    /** The camera the history was traced from. */
    const tracedView = useRef(new Matrix4())
    const readyRef = useRef(false)
    /** Mirrors the sample and probe counts, and the GPU's timings, for the panel's readout. */
    const progress = useRef({
      samples: "0",
      probes: "–",
      probesTime: "–",
      traceTime: "–",
      denoiseTime: "–",
      postTime: "–",
      renderScale: "100%",
    })
    /** Lowers the resolution on a GPU that can't hold the frame time. */
    const quality = useRef(qualityFor(true))
    /** When the last frame was drawn, for judging the frame rate where the GPU won't time itself. */
    const drawnAt = useRef<number | null>(null)
    /** How far the plus has spun, its turn now, and its turn when the history was traced. */
    const plusAngle = useRef(0)
    const plusTurnNow = useRef(plusTurn(0))
    const tracedPlusTurn = useRef(plusTurn(0))
    /** When the last spinning frame was drawn; null when it wasn't spinning. */
    const spunAt = useRef<number | null>(null)
    /** The transform gizmo, drawn on the overlay. */
    const gizmo = useMemo(() => new Scene(), [])

    // A click on the plus is a click on nothing: it can't be moved, and
    // whatever stands behind it can't be reached through it.
    const pick = useCallback((origin: Vector3, direction: Vector3) => {
      const hit = pickHit(origin, direction)
      return hit && hit.distance < plusHit(origin, direction, plusTurnNow.current) ? hit.name : null
    }, [])

    // A moved object changes all the light: start every mean over.
    const objectsMoved = useCallback(() => {
      if (passes.current) {
        applyObjects(passes.current.scene)
        passes.current.sceneChanged = true
      }
      accumulator.current.reset()
      probeSchedule.current.reset()
      invalidate()
      onMove()
    }, [invalidate, onMove])

    useEffect(() => {
      const device = webgpuDevice(renderer)
      if (!device) {
        onError(UNSUPPORTED)
        return
      }
      if (!device.features.has("timestamp-query")) {
        const readout = progress.current
        readout.probesTime = readout.traceTime = readout.denoiseTime = readout.postTime = "not offered"
      }

      let cancelled = false
      let created: GpuPasses | null = null
      const onTimings = (timings: Timings) => {
        progress.current.probesTime = milliseconds(timings.probes)
        progress.current.traceTime = milliseconds(timings.trace)
        progress.current.denoiseTime = milliseconds(timings.denoise)
        progress.current.postTime = milliseconds(timings.post)
        // Judged on frames that traced: a settled picture costs next to nothing.
        if (timings.trace === null || !SETTINGS.adaptive) return
        const total = [timings.probes, timings.trace, timings.denoise, timings.post].reduce<number>(
          (sum, ms) => sum + (ms ?? 0),
          0,
        )
        if (quality.current.sample(total, performance.now())) invalidate()
      }
      GpuPasses.create(device, canvas, onTimings)
        .then((result) => {
          if (cancelled) {
            result.dispose()
            return
          }
          created = result
          applySettings(result)
          applyObjects(result.scene)
          quality.current = qualityFor(result.timed)
          applyPlus(result.scene, plusTurnNow.current)
          tracedPlusTurn.current.copy(plusTurnNow.current)
          passes.current = result
          accumulator.current.reset()
          probeSchedule.current.reset()
          invalidate()
        })
        .catch((error: unknown) => {
          console.error(error)
          if (!cancelled) onError(FAILED)
        })

      return () => {
        cancelled = true
        created?.dispose()
        passes.current = null
      }
    }, [canvas, invalidate, onError, renderer])

    useEffect(() => {
      const gui = new GUI({ title: "Global Illumination · WebGPU" })

      // Anything that changes the light throws every running mean away.
      const sync = () => {
        if (passes.current) applySettings(passes.current)
        accumulator.current.limit = sampleLimit()
        accumulator.current.reset()
        probeSchedule.current.reset()
        // Settings change the cost too: measure afresh.
        quality.current.reset()
        invalidate()
      }
      // Grading happens after the mean, so it only needs a redraw.
      const redraw = () => invalidate()

      const scene = gui.addFolder("Scene")
      scene.addColor(SETTINGS, "emissiveColor").name("Emissive color").onChange(sync)
      scene.add(SETTINGS, "emissiveIntensity", 0, 60, 0.5).name("Emissive intensity").onChange(sync)
      scene.add(SETTINGS, "exposure", 0.1, 2, 0.01).name("Exposure").onChange(redraw)
      scene
        .add(
          {
            resetObjects: () => {
              resetObjects()
              objectsMoved()
            },
          },
          "resetObjects",
        )
        .name("Reset objects")

      const light = gui.addFolder("Light")
      light.add(SETTINGS, "lightX", -4.5, 24, 0.1).name("Position x").onChange(sync)
      light.add(SETTINGS, "lightY", 0.2, 14, 0.1).name("Position y").onChange(sync)
      light.add(SETTINGS, "lightZ", -12, 12, 0.1).name("Position z").onChange(sync)
      light.add(SETTINGS, "shadowSoftness", 0.1, 10, 0.1).name("Shadow softness").onChange(sync)
      light.add(SETTINGS, "ambient", 0, 1, 0.01).name("Ambient fill").onChange(sync)

      const sampling = gui.addFolder("GI Sampling")
      const method = sampling.add(SETTINGS, "method", Object.keys(METHODS)).name("Method")
      sampling.add(SETTINGS, "accumulate").name("Accumulate").onChange(sync)
      // These only steer the path tracer's bounce rays.
      const traced = [
        sampling.add(SETTINGS, "bounces", [1, 2]).name("Bounces").onChange(sync),
        sampling.add(SETTINGS, "sampling", Object.keys(SAMPLING)).name("Sampling").onChange(sync),
        sampling.add(SETTINGS, "marchSteps", MARCH_STEPS).name("March steps").onChange(sync),
        sampling.add(SETTINGS, "marchJitter").name("March jitter").onChange(sync),
        // Only the path tracer is noisy; the probes have nothing to smooth.
        sampling.add(SETTINGS, "denoise").name("Denoise").onChange(redraw),
      ]
      sampling.add(progress.current, "samples").name("Samples").disable().listen()

      const probeFolder = gui.addFolder("Probe Volume")
      probeFolder
        .add(SETTINGS, "probeRays", [16, 32, 64, 128])
        .name("Rays per probe")
        .onChange(sync)
      probeFolder.add(progress.current, "probes").name("Updates").disable().listen()

      // Grey out whatever the chosen method ignores. The probes stay live
      // either way: the path tracer's chrome reads them too.
      const showMethod = () => {
        const probing = SETTINGS.method === "Probe volume"
        traced.forEach((controller) => controller.enable(!probing))
      }
      method.onChange(() => {
        showMethod()
        sync()
      })
      showMethod()

      const volume = gui.addFolder("Volumetrics")
      volume.add(SETTINGS, "volumetrics").name("Enabled").onChange(sync)
      volume.add(SETTINGS, "volumeSteps", VOLUME_STEPS).name("March steps").onChange(sync)
      volume.add(SETTINGS, "volumeDensity", 0, 0.2, 0.001).name("Density").onChange(sync)

      const plus = gui.addFolder("Plus")
      plus
        .add(SETTINGS, "spin")
        .name("Spin")
        .onChange(() => {
          // Held still, it settles like everything else: every mean starts
          // over from where it stopped.
          if (!SETTINGS.spin) {
            accumulator.current.reset()
            probeSchedule.current.reset()
          }
          spunAt.current = null
          invalidate()
        })
      plus.add(SETTINGS, "spinSpeed", 0.1, 2, 0.05).name("Speed")
      // Off, the whole room keeps a short memory while it turns, as if every
      // surface were next to it.
      plus.add(SETTINGS, "localRefresh").name("Refresh near it only").onChange(sync)

      const bloom = gui.addFolder("Bloom")
      bloom.add(SETTINGS, "bloom", 0, 4, 0.05).name("Strength").onChange(redraw)
      bloom.add(SETTINGS, "bloomThreshold", 0, 3, 0.05).name("Threshold").onChange(redraw)
      bloom.add(SETTINGS, "bloomRadius", 0.5, 2, 0.05).name("Radius").onChange(redraw)

      // The frame resizes everything to a new ratio on its own.
      const gpu = gui.addFolder("GPU")
      gpu.add(SETTINGS, "pixelRatio", PIXEL_RATIOS).name("Max pixel ratio").onChange(sync)
      gpu
        .add(SETTINGS, "adaptive")
        .name("Adaptive resolution")
        .onChange(() => {
          quality.current = qualityFor(passes.current?.timed ?? true)
          invalidate()
        })
      gpu.add(progress.current, "renderScale").name("Render scale").disable().listen()
      gpu.add(progress.current, "probesTime").name("Probe update").disable().listen()
      gpu.add(progress.current, "traceTime").name("Trace").disable().listen()
      gpu.add(progress.current, "denoiseTime").name("Denoise").disable().listen()
      gpu.add(progress.current, "postTime").name("Composite to screen").disable().listen()

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
    }, [invalidate, objectsMoved])

    useFrame(
      ({ renderer: overlay, camera, size }) => {
        const pass = passes.current
        if (!pass) return

        // Where the GPU won't time itself, a frame rate below 50 while frames
        // run back to back says the same: the plus keeps them coming.
        const now = performance.now()
        if (SETTINGS.adaptive && !pass.timed && SETTINGS.spin && drawnAt.current !== null) {
          const interval = now - drawnAt.current
          if (interval < 250 && quality.current.sample(interval, now)) invalidate()
        }
        drawnAt.current = now

        // The picture is traced at its own pixel ratio, whatever the overlay's,
        // and below it where the GPU can't keep up.
        const scale = SETTINGS.adaptive ? quality.current.scale : 1
        const ratio = Math.min(window.devicePixelRatio || 1, SETTINGS.pixelRatio) * scale
        progress.current.renderScale = `${Math.round(scale * 100)}%`
        const width = Math.min(Math.max(1, Math.round(size.width * ratio)), pass.maxSize)
        const height = Math.min(Math.max(1, Math.round(size.height * ratio)), pass.maxSize)
        const frame = pass.frame
        if (pass.width !== width || pass.height !== height) {
          pass.setSize(width, height)
          frame.resolution.set(width, height)
          const tanHalfFov = Math.max(
            Math.tan((CAMERA.fov * Math.PI) / 360),
            Math.tan((CAMERA.minHorizontalFov * Math.PI) / 360) / (width / height),
          )
          frame.tanHalfFov = tanHalfFov
          // The shader casts its own rays; the camera is matched to them so the
          // gizmo draws, and clicks pick, exactly where the picture says.
          if ("fov" in camera) {
            camera.fov = (Math.atan(tanHalfFov) * 360) / Math.PI
            camera.updateProjectionMatrix()
          }
          accumulator.current.reset()
        }

        // The plus turns by the clock, a tenth of a second at most a frame,
        // so a tab left in the background doesn't come back with it whirled.
        const spinning = SETTINGS.spin
        if (spinning) {
          const now = performance.now()
          plusAngle.current += Math.min((now - (spunAt.current ?? now)) / 1000, 0.1) * SETTINGS.spinSpeed
          spunAt.current = now
          applyPlus(pass.scene, plusTurn(plusAngle.current, plusTurnNow.current))
          pass.sceneChanged = true
        }

        camera.updateMatrixWorld()
        const view = camera.matrixWorld
        const cameraMoving = cameraMoved(view.elements, tracedView.current.elements)
        // A turning plus moves light across everything, so nothing rests.
        const moving = cameraMoving || spinning
        const accumulate = SETTINGS.accumulate

        // The probe volume settles on its own clock, whatever the camera does,
        // and while the plus turns it keeps following. It runs for the path
        // tracer too: the chrome reads it for whatever it mirrors off screen.
        const probing = spinning || probeSchedule.current.pending()
        if (probing) {
          const weight = probeSchedule.current.next()
          pass.probeUpdate.weight = spinning ? Math.max(weight, PROBE_FOLLOW) : weight
          pass.probeUpdate.rotation = randomRotation()
        }
        frame.probeSettling = probing ? 0.1 : 0

        const tracing = moving || probing || accumulator.current.pending(accumulate)
        if (tracing) {
          const sample = accumulator.current.next(accumulate, moving)

          // The shader rebuilds each camera ray from the camera's own axes, and
          // finds last frame's surfaces through the camera that traced them.
          const last = tracedView.current
          frame.previousPosition.setFromMatrixPosition(last)
          frame.previousRight.setFromMatrixColumn(last, 0)
          frame.previousUp.setFromMatrixColumn(last, 1)
          frame.previousForward.setFromMatrixColumn(last, 2).negate()
          frame.cameraPosition.setFromMatrixPosition(view)
          frame.cameraRight.setFromMatrixColumn(view, 0)
          frame.cameraUp.setFromMatrixColumn(view, 1)
          frame.cameraForward.setFromMatrixColumn(view, 2).negate()
          // Measured frame to frame, so the last creep of a damped orbit never
          // adds up to a move and restarts a run already under way.
          last.copy(view)
          // And where the plus was, so its surface's light can follow it round.
          frame.plusPreviousTurn.copy(tracedPlusTurn.current)
          frame.plusPreviousCenter.copy(PLUS_CENTER)
          tracedPlusTurn.current.copy(plusTurnNow.current)

          frame.animating = spinning
          frame.mode = MODES[sample.mode]
          frame.weight = sample.weight
          frame.airWeight = spinning && !cameraMoving && sample.mode !== "fresh" ? AIR_FOLLOW : sample.weight
          frame.noiseIndex = sample.index
          frame.jitter.set(sample.jitterX, sample.jitterY)
          invalidate()
        }
        progress.current.probes = spinning
          ? "following the plus"
          : `${Math.min(probeSchedule.current.frames, PROBE_LIMIT)} / ${PROBE_LIMIT}`
        progress.current.samples = !accumulate
          ? "1 (no accumulation)"
          : spinning
            ? "live (plus spinning)"
            : cameraMoving
              ? "moving"
              : `${Math.min(accumulator.current.samples, accumulator.current.limit)} / ${accumulator.current.limit}`

        pass.bloomRadius = SETTINGS.bloomRadius
        // The same scale the tone map applies, so the threshold is judged on screen brightness.
        pass.bloomExposure = SETTINGS.exposure / 0.6
        pass.bloomThreshold = SETTINGS.bloomThreshold
        pass.render({
          probes: probing,
          trace: tracing,
          denoise: SETTINGS.denoise && SETTINGS.method === "Path traced",
          bloom: SETTINGS.bloom,
          exposure: SETTINGS.exposure,
        })

        // The overlay clears to clear, and shows the gizmo when something's selected.
        overlay.render(gizmo, camera)

        if (!readyRef.current) {
          readyRef.current = true
          onReady()
        }
      },
      // The render phase runs after every update; a job here replaces R3F's default render.
      { phase: "render" },
    )

    return (
      <Controls
        gizmo={gizmo}
        selected={selected}
        mode={mode}
        onSelect={onSelect}
        onMove={objectsMoved}
        home={CAMERA}
        pick={pick}
      />
    )
  },
)

GlobalIlluminationScene.displayName = "GlobalIlluminationScene"

/** Shown instead of the room where WebGPU isn't there, or won't run it. */
function Notice({ message }: { message: string }) {
  return (
    <div className={styles.notice} role="status">
      <p>{message}</p>
    </div>
  )
}

/**
 * Two canvases, one over the other. Underneath, the room, traced by compute
 * shaders straight on the WebGPU device. On top, a transparent R3F canvas,
 * also WebGPU, that owns the camera and every pointer event, draws the gizmo,
 * and lends its device to the passes beneath.
 */
export const GlobalIlluminationWebGPUCanvas: FC<CanvasProps> = (props) => {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [problem, setProblem] = useState(() => ("gpu" in navigator ? null : UNSUPPORTED))
  const onError = useCallback((message: string) => setProblem(message), [])
  const { onReady } = props

  // A notice is as ready as the page gets.
  useEffect(() => {
    if (problem) onReady()
  }, [onReady, problem])

  if (problem) return <Notice message={problem} />

  return (
    <div className={styles.layers}>
      <canvas ref={setCanvas} className={styles.picture} aria-hidden />
      {canvas && (
        <Canvas
          style={{ position: "absolute", inset: 0 }}
          frameloop="demand"
          // The gizmo is cheap; let it be sharp. The picture has its own ratio.
          dpr={[1, 2]}
          renderer={{ alpha: true }}
        >
          <GlobalIlluminationScene {...props} canvas={canvas} onError={onError} />
        </Canvas>
      )}
    </div>
  )
}
