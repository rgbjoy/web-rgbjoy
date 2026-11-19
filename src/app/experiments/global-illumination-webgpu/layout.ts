import { Matrix3, Vector2, Vector3 } from "three"

import { PROBE_COUNT, PROBE_GRID, PROBE_ORIGIN, PROBE_SPACING } from "./probes"
import {
  BLOCK_HALF,
  BLOCK_ROUNDING,
  GLOW_RADIUS,
  PEBBLE_RADIUS,
  ROOM_CENTER,
  ROOM_HALF,
  TORUS_RADIUS,
  TORUS_REACH,
  TORUS_TUBE,
  WALL,
  WINDOW,
} from "./room"
import { PLUS_ARM, PLUS_BAR, PLUS_ROUNDING, PLUS_STRIPES } from "./plus"

/**
 * The host side of every buffer the shaders read: byte for byte what WGSL's
 * layout rules make of their structs. A vec3f aligns to 16 bytes and leaves
 * room for one f32 after it; a mat3x3f is three such columns.
 */

const f = (n: number) => n.toFixed(4)
const vec3f = (v: readonly number[]) => `vec3f(${v.map(f).join(", ")})`

/** The room's shape, the plus and the probe grid as WGSL constants, from the same numbers the picking uses. */
export function wgslConstants() {
  return [
    `const ROOM_CENTER = ${vec3f(ROOM_CENTER)};`,
    `const ROOM_HALF = ${vec3f(ROOM_HALF)};`,
    `const WALL = ${f(WALL)};`,
    `const WINDOW = vec4f(${WINDOW.map(f).join(", ")});`,
    `const GLOW_RADIUS = ${f(GLOW_RADIUS)};`,
    `const PEBBLE_RADIUS = ${f(PEBBLE_RADIUS)};`,
    `const BLOCK_HALF = vec3f(${f(BLOCK_HALF)});`,
    `const BLOCK_ROUNDING = ${f(BLOCK_ROUNDING)};`,
    `const TORUS_RADIUS = ${f(TORUS_RADIUS)};`,
    `const TORUS_TUBE = ${f(TORUS_TUBE)};`,
    `const TORUS_REACH = ${f(TORUS_REACH)};`,
    `const PLUS_ARM = ${f(PLUS_ARM)};`,
    `const PLUS_BAR = ${f(PLUS_BAR)};`,
    `const PLUS_ROUNDING = ${f(PLUS_ROUNDING)};`,
    `const PLUS_STRIPES = ${f(PLUS_STRIPES)};`,
    `const PROBE_GRID = vec3i(${PROBE_GRID.join(", ")});`,
    `const PROBE_ORIGIN = ${vec3f(PROBE_ORIGIN)};`,
    `const PROBE_SPACING = ${f(PROBE_SPACING)};`,
    `const PROBE_COUNT = ${PROBE_COUNT}u;`,
  ].join("\n")
}

/** Writes a 3×3 matrix (column-major, as three.js keeps it) as three 16-byte columns. */
function writeMat3(target: Float32Array, offset: number, elements: ArrayLike<number>) {
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) target[offset + column * 4 + row] = elements[column * 3 + row]
  }
}

/** scene.wgsl's `Scene`: the sun, the fill, the glow and where the objects are. Shared by the trace and the probes. */
export class SceneUniforms {
  static readonly SIZE = 256

  lightPosition = new Vector3()
  shadowSoftness = 0
  emissive = new Vector3()
  ambient = 0
  glowCenter = new Vector3()
  pebbleCenter = new Vector3()
  blockCenter = new Vector3()
  torusCenter = new Vector3()
  /** World-to-local rotations. */
  blockInverse = new Matrix3()
  torusInverse = new Matrix3()
  plusCenter = new Vector3()
  plusInverse = new Matrix3()

  private readonly data = new Float32Array(SceneUniforms.SIZE / 4)

  pack() {
    const d = this.data
    this.lightPosition.toArray(d, 0)
    d[3] = this.shadowSoftness
    this.emissive.toArray(d, 4)
    d[7] = this.ambient
    this.glowCenter.toArray(d, 8)
    this.pebbleCenter.toArray(d, 12)
    this.blockCenter.toArray(d, 16)
    this.torusCenter.toArray(d, 20)
    writeMat3(d, 24, this.blockInverse.elements)
    writeMat3(d, 36, this.torusInverse.elements)
    this.plusCenter.toArray(d, 48)
    writeMat3(d, 52, this.plusInverse.elements)
    return d
  }
}

/** frame.wgsl's `Frame`: one frame of the camera, the noise and the path tracer's settings. */
export class FrameUniforms {
  static readonly SIZE = 256

  cameraPosition = new Vector3()
  cameraRight = new Vector3()
  cameraUp = new Vector3()
  cameraForward = new Vector3()
  tanHalfFov = 1
  /** The camera of the frame the history was traced from. */
  previousPosition = new Vector3()
  previousRight = new Vector3()
  previousUp = new Vector3()
  previousForward = new Vector3()
  /** How much of this frame goes into the running means of everything traced fresh. */
  weight = 1
  /** The same for the air alone, which keeps a short memory while the plus turns. */
  airWeight = 1
  /** Whether the plus is turning, so no light stays put for long. */
  animating = false
  noiseIndex = 0
  marchJitter = 0
  probeSettling = 0
  volumeDensity = 0
  resolution = new Vector2(1, 1)
  jitter = new Vector2(0.5, 0.5)
  mode = 0
  sampling = 0
  marchSteps = 1
  method = 0
  bounces = 1
  volumeSteps = 1
  /** The plus's turn (local to world) and centre when the history was traced. */
  plusPreviousTurn = new Matrix3()
  plusPreviousCenter = new Vector3()
  /** Whether the denoised bounce is of the history this frame reads. */
  smoothHistory = false
  /** Whether the probe volume holds any light yet. */
  probesReady = false
  /** Whether, while the plus turns, only surfaces near it keep a short memory. */
  localRefresh = false

  private readonly buffer = new ArrayBuffer(FrameUniforms.SIZE)
  private readonly f32 = new Float32Array(this.buffer)
  private readonly u32 = new Uint32Array(this.buffer)

  pack() {
    const d = this.f32
    this.cameraPosition.toArray(d, 0)
    d[3] = this.tanHalfFov
    this.cameraRight.toArray(d, 4)
    d[7] = this.weight
    this.cameraUp.toArray(d, 8)
    d[11] = this.noiseIndex
    this.cameraForward.toArray(d, 12)
    d[15] = this.marchJitter
    this.previousPosition.toArray(d, 16)
    d[19] = this.probeSettling
    this.previousRight.toArray(d, 20)
    d[23] = this.volumeDensity
    this.previousUp.toArray(d, 24)
    d[27] = this.airWeight
    this.previousForward.toArray(d, 28)
    this.resolution.toArray(d, 32)
    this.jitter.toArray(d, 34)
    const u = this.u32
    u[31] = this.animating ? 1 : 0
    u[36] = this.mode
    u[37] = this.sampling
    u[38] = this.marchSteps
    u[39] = this.method
    u[40] = this.bounces
    u[41] = this.volumeSteps
    writeMat3(d, 44, this.plusPreviousTurn.elements)
    this.plusPreviousCenter.toArray(d, 56)
    u[59] = this.smoothHistory ? 1 : 0
    u[60] = this.probesReady ? 1 : 0
    u[61] = this.localRefresh ? 1 : 0
    return this.buffer
  }
}

/** probe.wgsl's `ProbeUpdate`: this update's turn of the rays, how many, and how much it counts. */
export class ProbeUpdateUniforms {
  static readonly SIZE = 64

  /** Column-major 3×3. */
  rotation: ArrayLike<number> = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  rays = 64
  weight = 1

  private readonly buffer = new ArrayBuffer(ProbeUpdateUniforms.SIZE)
  private readonly f32 = new Float32Array(this.buffer)
  private readonly u32 = new Uint32Array(this.buffer)

  pack() {
    writeMat3(this.f32, 0, this.rotation)
    this.u32[12] = this.rays
    this.f32[13] = this.weight
    return this.buffer
  }
}

/** scene.wgsl's `Probe`: red, green and blue harmonics, then whether it's usable and how far it moved. */
export const PROBE_STRIDE = 64
