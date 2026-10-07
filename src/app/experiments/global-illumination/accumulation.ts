/** R2: the 2D golden-ratio sequence. Consecutive points never bunch up. */
const R2 = [0.7548776662466927, 0.5698402909980532] as const

/** The noise sequences wrap here so the index stays exact in a float. */
const NOISE_PERIOD = 4096

/**
 * How a frame treats what the last one left behind:
 * - `fresh`: nothing carries over (first frame, a resize, a changed setting, or accumulation off)
 * - `rest`: the camera hasn't moved; every pixel adds to its own running mean
 * - `moving`: the camera moved; each pixel finds its surface in the last frame and carries its bounce light over
 */
export type FrameMode = "fresh" | "rest" | "moving"

export type FrameSample = {
  mode: FrameMode
  /** How much of this frame goes into the running means of everything traced
   *  fresh each frame — the direct light, the surface colours, the air. They
   *  look different from every viewpoint, so they start over whenever the
   *  camera moves. */
  weight: number
  /** Drives the noise sequences. It never restarts, so the noise keeps moving
   *  even while every frame is the first of a new run. */
  index: number
  /** Sub-pixel offset of the camera ray, in pixels (0.5 is the centre). */
  jitterX: number
  jitterY: number
}

/**
 * Progressive accumulation. At rest each frame is blended in at 1/(n + 1), so
 * the targets hold the plain mean of every frame since the camera stopped —
 * then tracing stops, and the settled image is just redisplayed.
 */
export class Accumulator {
  /** Frames since the camera came to rest. */
  samples = 0
  private fresh = true
  private frame = 0

  constructor(readonly limit: number) {}

  /** The picture itself changed: nothing from before can be kept. */
  reset() {
    this.samples = 0
    this.fresh = true
  }

  /** Whether a frame with the camera at rest still has anything to add.
   *  Without accumulation that's one frame, until something changes. */
  pending(accumulate: boolean) {
    return this.samples < (accumulate ? this.limit : 1)
  }

  next(accumulate: boolean, moving: boolean): FrameSample {
    this.frame = (this.frame + 1) % NOISE_PERIOD
    const index = this.frame

    if (!accumulate) {
      // One sample a pixel, shown raw and left at that. The camera ray stays
      // centred, so it's the same frame you'd see in motion.
      this.fresh = false
      this.samples = 1
      return { mode: "fresh", weight: 1, index, jitterX: 0.5, jitterY: 0.5 }
    }

    if (moving) {
      // A moving frame is seen once and replaced; jitter would only make its
      // edges shimmer.
      const mode = this.fresh ? "fresh" : "moving"
      this.fresh = false
      this.samples = 0
      return { mode, weight: 1, index, jitterX: 0.5, jitterY: 0.5 }
    }

    // Free antialiasing: each sample lands somewhere else inside the pixel.
    const jitterX = (0.5 + index * R2[0]) % 1
    const jitterY = (0.5 + index * R2[1]) % 1

    if (this.fresh) {
      this.fresh = false
      // The first of a new run.
      this.samples = 1
      return { mode: "fresh", weight: 1, index, jitterX, jitterY }
    }

    const n = this.samples++
    return { mode: "rest", weight: 1 / (n + 1), index, jitterX, jitterY }
  }
}

/**
 * Whether the camera moved enough to see. Compares two column-major 4×4
 * matrices element by element: 2e-5 is about a twentieth of a pixel of turn
 * at this field of view, so a damped orbit stops counting as moving well
 * before it actually stops gliding.
 */
export function cameraMoved(a: ArrayLike<number>, b: ArrayLike<number>, tolerance = 2e-5) {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return true
  }
  return false
}
