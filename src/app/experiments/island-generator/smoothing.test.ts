import { describe, expect, test } from "bun:test"

import { gaussianSmoothGrid } from "./gaussian"
import {
  createIslandGeometry,
  createIslandHeightfield,
  createShorelineDepthMap,
  SHALLOW_WATER_DEPTH,
  DEFAULT_ISLAND_SETTINGS,
  ISLAND_BASE_LEVEL,
  ISLAND_SIZE,
  MAX_RESOLUTION,
  MIN_WATER_LEVEL,
  normalizeIslandResolution,
  sampleIslandHeight,
  type IslandHeightfield,
} from "./terrain"

function roughness({ gridSegments, heights }: IslandHeightfield) {
  const stride = gridSegments + 1
  let total = 0
  for (let row = 1; row < gridSegments; row += 1) {
    for (let column = 1; column < gridSegments; column += 1) {
      const index = row * stride + column
      const curvature = 4 * heights[index] - heights[index - 1] -
        heights[index + 1] - heights[index - stride] - heights[index + stride]
      total += curvature * curvature
    }
  }
  return total
}

describe("Gaussian smoothing", () => {
  test("resolution supports 64-step grids through 512 and defaults to 256", () => {
    expect(DEFAULT_ISLAND_SETTINGS.resolution).toBe(256)
    expect(MAX_RESOLUTION).toBe(512)
    for (const resolution of [64, 128, 192, 256, 320, 384, 448, 512]) {
      expect(normalizeIslandResolution(resolution)).toBe(resolution)
    }
    expect(normalizeIslandResolution(576)).toBe(512)
    const geometry = createIslandGeometry({
      ...DEFAULT_ISLAND_SETTINGS, resolution: 512, smoothing: 1,
    })
    try {
      expect(geometry.getAttribute("position").count).toBe(512 * 512 * 6)
    } finally {
      geometry.dispose()
    }
  })

  test("off skips filtering and constant heights remain constant", () => {
    const source = new Float32Array(81).fill(3.25)
    expect(gaussianSmoothGrid(source, 9, 0)).toBe(source)
    const result = gaussianSmoothGrid(source, 9, 2)
    expect(result).not.toBe(source)
    expect(result).toEqual(source)
  })

  test("a peak spreads symmetrically without changing the input", () => {
    const source = new Float32Array(25 * 25)
    source[12 * 25 + 12] = 1
    const result = gaussianSmoothGrid(source, 25, 1.5)
    expect(source[12 * 25 + 12]).toBe(1)
    expect(result[12 * 25 + 12]).toBeLessThan(1)
    expect(result.reduce((sum, height) => sum + height, 0)).toBeCloseTo(1, 6)
    for (let offset = 1; offset <= 5; offset += 1) {
      expect(result[12 * 25 + 12 + offset]).toBeCloseTo(result[(12 + offset) * 25 + 12], 7)
      expect(result[12 * 25 + 12 - offset]).toBe(result[12 * 25 + 12 + offset])
    }
  })

  test("off preserves the original height sampling", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 192, smoothing: 0 }
    const geometry = createIslandGeometry(settings)
    try {
      const positions = geometry.getAttribute("position")
      for (let index = 0; index < positions.count; index += 1) {
        expect(positions.getY(index)).toBe(Math.fround(sampleIslandHeight(
          positions.getX(index), positions.getZ(index), settings,
        )))
      }
    } finally {
      geometry.dispose()
    }
  })

  test("increasing smoothing reduces roughness deterministically", () => {
    let previous = Infinity
    for (const smoothing of [0, 0.5, 1]) {
      const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 128, smoothing }
      const field = createIslandHeightfield(settings)
      expect(field.heights).toEqual(createIslandHeightfield(settings).heights)
      expect(roughness(field)).toBeLessThan(previous)
      previous = roughness(field)
    }
  })

  test("terrain and shore ramp use the same smoothed profile", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64, smoothing: 1 }
    const field = createIslandHeightfield(settings)
    const terrain = createIslandGeometry(settings, field)
    const shoreRamp = createShorelineDepthMap(settings, field)
    const independentRamp = createShorelineDepthMap(settings)
    const originalRamp = createShorelineDepthMap({ ...settings, smoothing: 0 })
    try {
      const positions = terrain.getAttribute("position")
      for (let index = 0; index < positions.count; index += 1) {
        expect(positions.getY(index)).toBeCloseTo(sampleIslandHeight(
          positions.getX(index), positions.getZ(index), settings, field,
        ), 6)
      }
      expect(shoreRamp.data).toEqual(independentRamp.data)
      expect(shoreRamp.data).not.toEqual(originalRamp.data)
      // The ramp is a straight readout of the same heights the terrain uses.
      expect(shoreRamp.size).toBe(field.gridSegments + 1)
      for (let index = 0; index < field.heights.length; index += 1) {
        const depth = (settings.waterLevel - field.heights[index]) / SHALLOW_WATER_DEPTH
        expect(shoreRamp.data[index]).toBe(
          Math.round(Math.min(1, Math.max(0, depth)) * 255),
        )
      }
    } finally {
      terrain.dispose()
    }
  })

  test("maximum smoothing keeps all edges submerged at extreme settings", () => {
    for (const resolution of [64, MAX_RESOLUTION]) {
      for (const elevation of [2.4, 12]) {
        const settings = {
          ...DEFAULT_ISLAND_SETTINGS,
          resolution, elevation, smoothing: 1, islandSize: 1.4,
          persistence: 1.7, lacunarity: 2.32, noiseScale: 0.152,
          offsetX: 100, offsetY: -100, waterLevel: MIN_WATER_LEVEL,
        }
        const field = createIslandHeightfield(settings)
        for (let index = 0; index <= resolution; index += 1) {
          const position = -ISLAND_SIZE / 2 + index * ISLAND_SIZE / resolution
          for (const [x, z] of [[position, -32], [position, 32], [-32, position], [32, position]]) {
            const height = sampleIslandHeight(x, z, settings, field)
            expect(height).toBeCloseTo(ISLAND_BASE_LEVEL, 6)
            expect(height).toBeLessThan(settings.waterLevel)
          }
        }
      }
    }
  })
})
