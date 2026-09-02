import {
  HIGH_GRASS_START,
  ISLAND_SIZE,
  peakAboveWater,
  sampleIslandHeight,
  valueNoise,
  type IslandHeightfield,
  type IslandSettings,
} from "./terrain"

/**
 * Nominal gap between candidate trees, in world units, before thinning. Held
 * above the 0.24 canopy diameter on purpose: at or below it every crown
 * overlaps its neighbours and the wood renders as one dark mat rather than
 * as trees.
 */
const TREE_SPACING = 0.3
/** Lattice scale for the clumping field. Lower spreads forests wider. */
const FOREST_NOISE_SCALE = 0.055
/** Canopy takes hold above this share of the forest field. */
const FOREST_THRESHOLD = 0.46
/** Steepest ground a tree will stand on, as a height change per world unit. */
const MAX_TREE_SLOPE = 0.85
/**
 * Safety valve only, not a density control: the busiest settings plant around
 * 7,400, so this should never be reached. It matters that it is generous —
 * placement scans row by row, so a cap that bites truncates the far side of the
 * island rather than thinning the wood evenly.
 */
const MAX_TREES = 20000

export type TreePlacements = {
  count: number
  /** Ground position per tree, three floats each. */
  positions: Float32Array
  /** Uniform scale per tree. */
  scales: Float32Array
  /** Rotation about Y per tree, radians. */
  rotations: Float32Array
}

const EMPTY_PLACEMENTS: TreePlacements = {
  count: 0,
  positions: new Float32Array(0),
  scales: new Float32Array(0),
  rotations: new Float32Array(0),
}

/** Deterministic per-candidate randomness, so a seed always plants the same wood. */
function jitter(x: number, y: number, seed: number) {
  let value = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967295
}

/**
 * Scatters trees across the high-grass band. Placement is driven by a second
 * noise field rather than uniform density, so woods clump and thin the way
 * forests do instead of covering the band evenly.
 *
 * Purely presentational: nothing here feeds the heightfield or the export.
 */
export function createTreePlacements(
  settings: IslandSettings,
  heightfield: IslandHeightfield,
): TreePlacements {
  const peak = peakAboveWater(heightfield.heights, settings.waterLevel)
  if (peak <= 0) return EMPTY_PLACEMENTS

  const half = ISLAND_SIZE / 2
  const steps = Math.floor(ISLAND_SIZE / TREE_SPACING)
  const positions: number[] = []
  const scales: number[] = []
  const rotations: number[] = []

  for (let row = 0; row < steps && scales.length < MAX_TREES; row += 1) {
    for (let column = 0; column < steps && scales.length < MAX_TREES; column += 1) {

      // Jittered off the lattice, or the wood reads as an orchard.
      const offsetX = jitter(column, row, settings.seed) - 0.5
      const offsetZ = jitter(row, column, settings.seed ^ 0x5bf03635) - 0.5
      const worldX = -half + (column + 0.5 + offsetX) * TREE_SPACING
      const worldZ = -half + (row + 0.5 + offsetZ) * TREE_SPACING

      const height = sampleIslandHeight(worldX, worldZ, settings, heightfield)
      const relative = (height - settings.waterLevel) / peak
      if (relative < HIGH_GRASS_START) continue

      // Nothing takes root on a cliff. Sampling a step either side is enough at
      // this density and avoids walking the grid a second time.
      const step = TREE_SPACING
      const slopeX =
        sampleIslandHeight(worldX + step, worldZ, settings, heightfield) -
        sampleIslandHeight(worldX - step, worldZ, settings, heightfield)
      const slopeZ =
        sampleIslandHeight(worldX, worldZ + step, settings, heightfield) -
        sampleIslandHeight(worldX, worldZ - step, settings, heightfield)
      if (Math.hypot(slopeX, slopeZ) / (2 * step) > MAX_TREE_SLOPE) continue

      const density = valueNoise(
        worldX * FOREST_NOISE_SCALE,
        worldZ * FOREST_NOISE_SCALE,
        settings.seed ^ 0x1b873593,
      )
      if (density < FOREST_THRESHOLD) continue

      // Thin toward the edge of a wood so it fades out instead of stopping dead.
      const edge = (density - FOREST_THRESHOLD) / (1 - FOREST_THRESHOLD)
      if (jitter(column, row, settings.seed ^ 0x9e3779b9) > 0.35 + edge * 0.65) {
        continue
      }

      positions.push(worldX, height, worldZ)
      scales.push(0.72 + jitter(column, row, settings.seed ^ 0x85ebca6b) * 0.62)
      rotations.push(jitter(row, column, settings.seed ^ 0xc2b2ae35) * Math.PI * 2)
    }
  }

  return {
    count: scales.length,
    positions: new Float32Array(positions),
    scales: new Float32Array(scales),
    rotations: new Float32Array(rotations),
  }
}
