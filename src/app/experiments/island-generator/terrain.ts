import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
} from "three"

import { gaussianSmoothGrid } from "./gaussian"
import { softenShoreHeight } from "./shore"

export type IslandSettings = {
  seed: number
  persistence: number
  lacunarity: number
  noiseScale: number
  ridginess: number
  elevation: number
  islandSize: number
  shoreSoftness: number
  offsetX: number
  offsetY: number
  waterLevel: number
  resolution: number
  smoothing: number
}

export const DEFAULT_ISLAND_SETTINGS: IslandSettings = {
  seed: 5136,
  persistence: 0.67,
  lacunarity: 1.51,
  noiseScale: 0.064,
  ridginess: 0,
  elevation: 7.2,
  islandSize: 1,
  shoreSoftness: 0,
  offsetX: 0,
  offsetY: 0,
  waterLevel: 0,
  resolution: 256,
  smoothing: 0.25,
}

/** World-space footprint of the generated terrain. */
export const ISLAND_SIZE = 64
export const WATER_LEVEL = 0
export const ISLAND_BASE_LEVEL = WATER_LEVEL - 0.12
export const MIN_WATER_LEVEL = ISLAND_BASE_LEVEL + 0.02
export const MAX_WATER_LEVEL = 3.5
export const MIN_RESOLUTION = 64
export const MAX_RESOLUTION = 512
export const RESOLUTION_STEP = 64
/* Noise ranges are centred on the defaults, so each slider opens at its own
   midpoint and has equal room either way. Lower bounds are floors, not choices:
   persistence must stay positive, and lacunarity below ~1.2 stops each octave
   from adding frequency at all. */
export const MIN_PERSISTENCE = 0.1
export const MAX_PERSISTENCE = 1.24
export const MIN_LACUNARITY = 1.2
export const MAX_LACUNARITY = 1.82
export const MIN_NOISE_SCALE = 0.02
export const MAX_NOISE_SCALE = 0.108
export const MIN_ELEVATION = 2.4
export const MAX_ELEVATION = 12
export const MIN_ISLAND_SIZE = 0.6
export const MAX_ISLAND_SIZE = 1.4

const OCTAVES = 5
/* Ridged octaves are remapped onto the plain octaves' mean and spread, measured
   over this lattice, so ridginess sharpens relief without also changing how much
   of the island stands above water. See the ridginess tests. */
const RIDGE_SCALE = 1
const RIDGE_OFFSET = -0.075
/** How strongly a crest lets the next octave through (Musgrave weighting). */
const RIDGE_GAIN = 1.7
/* Only the broad octaves are ridged. Ridging the fine ones too put a crest on
   every pebble, which shredded the coastline into an archipelago instead of
   carving ridgelines down a solid island. */
const RIDGE_OCTAVES = 3
// World-space width keeps smoothing comparable when resolution changes.
const MAX_SMOOTHING_SIGMA = 1.5
/** Depth below the waterline at which the shore ramp reaches open-ocean colour. */
export const SHALLOW_WATER_DEPTH = 0.72
/** Blend width, also a fraction of the peak, so bands stay proportional. */
const BIOME_TRANSITION_HALF_WIDTH = 0.05

const BIOME_COLORS = {
  sand: new Color("#ddea9f"),
  grass: new Color("#63cf57"),
  highGrass: new Color("#2e8e43"),
}

/**
 * Bands are fractions of the island's own height above water, not world units,
 * so the palette lands the same way whether the peak is 4 units or 12. With
 * absolute thresholds a low island came out all beach and a tall one spent most
 * of its range in the top band.
 */
const BIOME_TRANSITIONS = [
  { at: 0.1, next: BIOME_COLORS.grass },
  { at: 0.4, next: BIOME_COLORS.highGrass },
]

/** Where the high-grass band begins; trees follow the same line. */
export const HIGH_GRASS_START = BIOME_TRANSITIONS[1].at

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function normalizeIslandResolution(resolution: number) {
  return clamp(
    Math.round(resolution / RESOLUTION_STEP) * RESOLUTION_STEP,
    MIN_RESOLUTION,
    MAX_RESOLUTION,
  )
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** A stable integer hash used by the value-noise lattice. */
function hash2(x: number, y: number, seed: number) {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967295
}

export function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = smoothstep(0, 1, fx)
  const uy = smoothstep(0, 1, fy)

  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  const bottom = a + (b - a) * ux
  const top = c + (d - c) * ux

  return bottom + (top - bottom) * uy
}

function fractalNoise(x: number, y: number, settings: IslandSettings) {
  const ridginess = clamp(settings.ridginess ?? 0, 0, 1)
  let value = 0
  let amplitude = 1
  let frequency = 1
  let amplitudeTotal = 0
  // Carries how much the octave above cleared the way for this one. Stays at 1
  // throughout when ridginess is 0, which is what keeps plain fBm untouched.
  let weight = 1

  for (let octave = 0; octave < OCTAVES; octave += 1) {
    const plain = valueNoise(x * frequency, y * frequency, settings.seed + octave * 1013)
    // Crests form where the lattice crosses its midpoint. The fold is left
    // unsquared: squaring drove the troughs so deep they cut the island into an
    // archipelago, and the plain fold already shares plain noise's mean.
    const crest = 1 - Math.abs(plain * 2 - 1)
    const ridged = crest * RIDGE_SCALE + RIDGE_OFFSET
    const octaveRidginess = octave < RIDGE_OCTAVES ? ridginess : 0
    const sample = plain + (ridged - plain) * octaveRidginess

    value += sample * amplitude * weight
    amplitudeTotal += amplitude * weight

    // An octave only lands where the one above it was already high, so fine
    // detail follows the ridgelines instead of chopping across them.
    weight = 1 + (clamp(ridged * RIDGE_GAIN, 0, 1) - 1) * octaveRidginess
    amplitude *= settings.persistence
    frequency *= settings.lacunarity
  }

  return value / amplitudeTotal
}

/**
 * Samples the island height at one point in world space. The broad radial lift
 * guarantees a useful land mass while the smooth outer falloff always sinks
 * the terrain boundary beneath the ocean plane.
 */
function sampleIslandProfileHeight(
  worldX: number,
  worldZ: number,
  settings: IslandSettings,
) {
  const halfSize = ISLAND_SIZE / 2
  const radius = Math.hypot(worldX / halfSize, worldZ / halfSize)
  const sampleX = (worldX + settings.offsetX) * settings.noiseScale
  const sampleY = (worldZ + settings.offsetY) * settings.noiseScale
  const noise = fractalNoise(sampleX, sampleY, settings)
  const centerLift = Math.max(0, 1 - radius) * 0.22
  const falloffStart = clamp(
    0.45 + (settings.islandSize - 1) * 0.55,
    0.2,
    0.75,
  )
  const edgeFalloff = smoothstep(falloffStart, 1, radius) * 0.95
  const normalizedHeight = noise * 1.7 + centerLift - 0.82 - edgeFalloff

  return normalizedHeight * settings.elevation
}

export type IslandHeightfield = {
  gridSegments: number
  /** Smoothed and shore-shaped profile before the seabed clamp, shared by water. */
  heights: Float32Array
}

export function createIslandHeightfield(settings: IslandSettings): IslandHeightfield {
  const gridSegments = normalizeIslandResolution(settings.resolution)
  const stride = gridSegments + 1
  const cellSize = ISLAND_SIZE / gridSegments
  const halfSize = ISLAND_SIZE / 2
  const source = new Float32Array(stride * stride)

  for (let row = 0; row < stride; row += 1) {
    const worldZ = Math.fround(-halfSize + row * cellSize)
    for (let column = 0; column < stride; column += 1) {
      const worldX = Math.fround(-halfSize + column * cellSize)
      source[row * stride + column] = sampleIslandProfileHeight(worldX, worldZ, settings)
    }
  }

  const sigma = clamp(settings.smoothing ?? 0, 0, 1) * MAX_SMOOTHING_SIGMA / cellSize
  const heights = gaussianSmoothGrid(source, stride, sigma)
  const shoreSoftness = clamp(settings.shoreSoftness ?? 0, 0, 1)
  if (shoreSoftness > 0) {
    // Shape after Gaussian filtering so the beach remains gentle at any blur.
    // Keep unclamped underwater heights so the shore ramp tracks real depth.
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = softenShoreHeight(heights[index], settings.waterLevel, shoreSoftness)
    }
  }
  if (sigma > 0 || shoreSoftness > 0) {
    // Filtering and shore shaping must never lift the perimeter off the seabed.
    for (let edge = 0; edge < stride; edge += 1) {
      for (const index of [edge, gridSegments * stride + edge, edge * stride, edge * stride + gridSegments]) {
        heights[index] = Math.min(heights[index], ISLAND_BASE_LEVEL)
      }
    }
  }
  return { gridSegments, heights }
}

/** Supply a shared heightfield when sampling many smoothed points. */
export function sampleIslandHeight(
  worldX: number,
  worldZ: number,
  settings: IslandSettings,
  heightfield?: IslandHeightfield,
) {
  if (!heightfield && (settings.smoothing ?? 0) === 0 && (settings.shoreSoftness ?? 0) === 0) {
    return Math.max(ISLAND_BASE_LEVEL, sampleIslandProfileHeight(worldX, worldZ, settings))
  }
  const { gridSegments, heights } = heightfield ?? createIslandHeightfield(settings)
  const stride = gridSegments + 1
  const x = clamp((worldX / ISLAND_SIZE + 0.5) * gridSegments, 0, gridSegments)
  const z = clamp((worldZ / ISLAND_SIZE + 0.5) * gridSegments, 0, gridSegments)
  const column = Math.min(Math.floor(x), gridSegments - 1)
  const row = Math.min(Math.floor(z), gridSegments - 1)
  const tx = x - column
  const tz = z - row
  const bottom = heights[row * stride + column] * (1 - tx) + heights[row * stride + column + 1] * tx
  const top = heights[(row + 1) * stride + column] * (1 - tx) + heights[(row + 1) * stride + column + 1] * tx
  return Math.max(ISLAND_BASE_LEVEL, bottom * (1 - tz) + top * tz)
}

/** Highest point standing above the waterline; the scale the bands divide up. */
export function peakAboveWater(heights: Float32Array, waterLevel: number) {
  let peak = 0
  for (let index = 0; index < heights.length; index += 1) {
    const above = heights[index] - waterLevel
    if (above > peak) peak = above
  }
  return peak
}

function biomeColor(
  height: number,
  waterLevel: number,
  peak: number,
  target: Color,
) {
  // A fully drowned island has no scale to divide, so everything reads as shore.
  const relativeHeight = peak > 0 ? (height - waterLevel) / peak : 0
  let current = BIOME_COLORS.sand

  for (const transition of BIOME_TRANSITIONS) {
    const transitionStart = transition.at - BIOME_TRANSITION_HALF_WIDTH
    const transitionEnd = transition.at + BIOME_TRANSITION_HALF_WIDTH

    if (relativeHeight < transitionStart) {
      return target.copy(current)
    }

    if (relativeHeight <= transitionEnd) {
      return target
        .copy(current)
        .lerp(
          transition.next,
          smoothstep(transitionStart, transitionEnd, relativeHeight),
        )
    }

    current = transition.next
  }

  return target.copy(current)
}

export function createIslandGeometry(
  settings: IslandSettings,
  heightfield = createIslandHeightfield(settings),
) {
  const { gridSegments, heights } = heightfield
  const indexed = new PlaneGeometry(
    ISLAND_SIZE,
    ISLAND_SIZE,
    gridSegments,
    gridSegments,
  )
  indexed.rotateX(-Math.PI / 2)

  const positions = indexed.getAttribute("position")
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(
      index,
      Math.max(ISLAND_BASE_LEVEL, heights[index]),
    )
  }

  const geometry = indexed.toNonIndexed() as BufferGeometry
  indexed.dispose()

  const facePositions = geometry.getAttribute("position")
  const colors = new Float32Array(facePositions.count * 3)
  const color = new Color()
  const peak = peakAboveWater(heights, settings.waterLevel)

  // Use height-based colors at each vertex so neighboring facets agree on the
  // biome boundary. Narrow blend zones soften the threshold without removing
  // the mesh's flat-shaded geometry.
  for (let vertex = 0; vertex < facePositions.count; vertex += 1) {
    biomeColor(
      facePositions.getY(vertex),
      settings.waterLevel,
      peak,
      color,
    )

    const colorIndex = vertex * 3
    colors[colorIndex] = color.r
    colors[colorIndex + 1] = color.g
    colors[colorIndex + 2] = color.b
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return geometry
}

/**
 * Bakes the shore ramp to one byte per heightfield vertex: 0 at the waterline,
 * 255 once the seabed sits SHALLOW_WATER_DEPTH beneath it. The water material
 * samples this bilinearly, so the shallows follow every inlet at sub-cell
 * accuracy instead of snapping to whole grid cells.
 *
 * Sampled from the unclamped profile rather than the drawn seabed, so the ramp
 * tracks the real bathymetry instead of flattening out at ISLAND_BASE_LEVEL.
 */
export function createShorelineDepthMap(
  settings: IslandSettings,
  heightfield = createIslandHeightfield(settings),
) {
  const { gridSegments, heights } = heightfield
  const size = gridSegments + 1
  const data = new Uint8Array(size * size)

  for (let index = 0; index < heights.length; index += 1) {
    const depth = (settings.waterLevel - heights[index]) / SHALLOW_WATER_DEPTH
    data[index] = Math.round(clamp(depth, 0, 1) * 255)
  }

  return { size, data }
}
