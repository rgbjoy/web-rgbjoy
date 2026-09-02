import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
} from "three/webgpu"

export type IslandSettings = {
  seed: number
  persistence: number
  lacunarity: number
  noiseScale: number
  elevation: number
  islandSize: number
  offsetX: number
  offsetY: number
  waterLevel: number
  resolution: number
}

export const DEFAULT_ISLAND_SETTINGS: IslandSettings = {
  seed: 5136,
  persistence: 0.9,
  lacunarity: 1.76,
  noiseScale: 0.086,
  elevation: 7.2,
  islandSize: 1,
  offsetX: 0,
  offsetY: 0,
  waterLevel: 0,
  resolution: 256,
}

/** World-space footprint of the generated terrain. */
export const ISLAND_SIZE = 64
export const WATER_LEVEL = 0
export const ISLAND_BASE_LEVEL = WATER_LEVEL - 0.12
export const MIN_WATER_LEVEL = ISLAND_BASE_LEVEL + 0.02
export const MAX_WATER_LEVEL = 3.5
export const MIN_RESOLUTION = 64
export const MAX_RESOLUTION = 384
export const RESOLUTION_STEP = 64
export const MIN_ELEVATION = 2.4
export const MAX_ELEVATION = 12
export const MIN_ISLAND_SIZE = 0.6
export const MAX_ISLAND_SIZE = 1.4

/** Keep roughly the same facet density now that the island spans more ground. */
const OCTAVES = 5
const SHALLOW_WATER_DEPTH = 0.72
const SHALLOW_WATER_SHORE_OVERLAP = 0.06
const SHALLOW_WATER_SURFACE_OFFSET = 0.035
const BIOME_TRANSITION_HALF_WIDTH = 0.22

const BIOME_COLORS = {
  sand: new Color("#ddea9f"),
  grass: new Color("#63cf57"),
  highGrass: new Color("#2e8e43"),
  rock: new Color("#504b46"),
  snow: new Color("#e6eee8"),
}

const BIOME_TRANSITIONS = [
  { height: 0.42, next: BIOME_COLORS.grass },
  { height: 1.75, next: BIOME_COLORS.highGrass },
  { height: 2.8, next: BIOME_COLORS.rock },
  { height: 3.5, next: BIOME_COLORS.snow },
]

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

function valueNoise(x: number, y: number, seed: number) {
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
  let value = 0
  let amplitude = 1
  let frequency = 1
  let amplitudeTotal = 0

  for (let octave = 0; octave < OCTAVES; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, settings.seed + octave * 1013) * amplitude
    amplitudeTotal += amplitude
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

export function sampleIslandHeight(
  worldX: number,
  worldZ: number,
  settings: IslandSettings,
) {
  return Math.max(
    ISLAND_BASE_LEVEL,
    sampleIslandProfileHeight(worldX, worldZ, settings),
  )
}

function biomeColor(
  height: number,
  waterLevel: number,
  target: Color,
) {
  const heightAboveWater = height - waterLevel
  let current = BIOME_COLORS.sand

  for (const transition of BIOME_TRANSITIONS) {
    const transitionStart =
      transition.height - BIOME_TRANSITION_HALF_WIDTH
    const transitionEnd = transition.height + BIOME_TRANSITION_HALF_WIDTH

    if (heightAboveWater < transitionStart) {
      return target.copy(current)
    }

    if (heightAboveWater <= transitionEnd) {
      return target
        .copy(current)
        .lerp(
          transition.next,
          smoothstep(transitionStart, transitionEnd, heightAboveWater),
        )
    }

    current = transition.next
  }

  return target.copy(current)
}

export function createIslandGeometry(settings: IslandSettings) {
  const gridSegments = normalizeIslandResolution(settings.resolution)
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
      sampleIslandHeight(positions.getX(index), positions.getZ(index), settings),
    )
  }

  const geometry = indexed.toNonIndexed() as BufferGeometry
  indexed.dispose()

  const facePositions = geometry.getAttribute("position")
  const colors = new Float32Array(facePositions.count * 3)
  const color = new Color()

  // Use height-based colors at each vertex so neighboring facets agree on the
  // biome boundary. Narrow blend zones soften the threshold without removing
  // the mesh's flat-shaded geometry.
  for (let vertex = 0; vertex < facePositions.count; vertex += 1) {
    biomeColor(
      facePositions.getY(vertex),
      settings.waterLevel,
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
 * Builds a thin surface mesh over terrain cells immediately below sea level.
 * Because it samples the same height field, the light-water band follows every
 * generated inlet and beach instead of forming a generic radial ring.
 */
export function createShallowWaterGeometry(settings: IslandSettings) {
  const positions: number[] = []
  const halfSize = ISLAND_SIZE / 2
  const gridSegments = normalizeIslandResolution(settings.resolution)
  const cellSize = ISLAND_SIZE / gridSegments
  const vertexStride = gridSegments + 1
  const heights = new Float32Array(vertexStride * vertexStride)
  const shallowCells = new Uint8Array(gridSegments * gridSegments)
  const shallowWaterMinimum = settings.waterLevel - SHALLOW_WATER_DEPTH
  const shallowWaterMaximum =
    settings.waterLevel + SHALLOW_WATER_SHORE_OVERLAP
  const shallowWaterSurface =
    settings.waterLevel + SHALLOW_WATER_SURFACE_OFFSET

  for (let row = 0; row <= gridSegments; row += 1) {
    const worldZ = -halfSize + row * cellSize

    for (let column = 0; column <= gridSegments; column += 1) {
      const worldX = -halfSize + column * cellSize
      // Use the unclamped profile so flattening the submerged terrain into a
      // base does not turn the entire ocean into shallow water.
      heights[row * vertexStride + column] = sampleIslandProfileHeight(
        worldX,
        worldZ,
        settings,
      )
    }
  }

  for (let row = 0; row < gridSegments; row += 1) {
    for (let column = 0; column < gridSegments; column += 1) {
      const bottomLeft = heights[row * vertexStride + column]
      const bottomRight = heights[row * vertexStride + column + 1]
      const topLeft = heights[(row + 1) * vertexStride + column]
      const topRight = heights[(row + 1) * vertexStride + column + 1]
      const minimumHeight = Math.min(
        bottomLeft,
        bottomRight,
        topLeft,
        topRight,
      )
      const maximumHeight = Math.max(
        bottomLeft,
        bottomRight,
        topLeft,
        topRight,
      )

      if (
        maximumHeight >= shallowWaterMinimum &&
        minimumHeight <= shallowWaterMaximum
      ) {
        shallowCells[row * gridSegments + column] = 1
      }
    }
  }

  // Close isolated one-cell holes and tiny notches without expanding the broad
  // inner or outer edge of the band.
  let closedShallowCells = shallowCells
  let filledGap = true
  while (filledGap) {
    filledGap = false
    const nextShallowCells = closedShallowCells.slice()

    for (let row = 1; row < gridSegments - 1; row += 1) {
      for (let column = 1; column < gridSegments - 1; column += 1) {
        const cellIndex = row * gridSegments + column
        if (closedShallowCells[cellIndex]) continue

        const adjacentCount =
          closedShallowCells[cellIndex - 1] +
          closedShallowCells[cellIndex + 1] +
          closedShallowCells[cellIndex - gridSegments] +
          closedShallowCells[cellIndex + gridSegments]

        if (adjacentCount >= 3) {
          nextShallowCells[cellIndex] = 1
          filledGap = true
        }
      }
    }

    closedShallowCells = nextShallowCells
  }

  for (let row = 0; row < gridSegments; row += 1) {
    const z0 = -halfSize + row * cellSize
    const z1 = z0 + cellSize

    for (let column = 0; column < gridSegments; column += 1) {
      if (!closedShallowCells[row * gridSegments + column]) continue

      const x0 = -halfSize + column * cellSize
      const x1 = x0 + cellSize

      positions.push(
        x0,
        shallowWaterSurface,
        z0,
        x0,
        shallowWaterSurface,
        z1,
        x1,
        shallowWaterSurface,
        z1,
        x0,
        shallowWaterSurface,
        z0,
        x1,
        shallowWaterSurface,
        z1,
        x1,
        shallowWaterSurface,
        z0,
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return geometry
}
