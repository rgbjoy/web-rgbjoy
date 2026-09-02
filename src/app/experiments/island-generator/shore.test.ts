import { describe, expect, test } from "bun:test"

import { SHORE_BLEND_HEIGHT, softenShoreHeight } from "./shore"
import {
  createIslandGeometry,
  createIslandHeightfield,
  createShorelineDepthMap,
  DEFAULT_ISLAND_SETTINGS,
  ISLAND_BASE_LEVEL,
  MAX_WATER_LEVEL,
  MIN_WATER_LEVEL,
  sampleIslandHeight,
} from "./terrain"

describe("shore softness", () => {
  test("zero preserves heights exactly; distant terrain and the waterline stay fixed", () => {
    expect(DEFAULT_ISLAND_SETTINGS.shoreSoftness).toBe(0)
    for (const water of [MIN_WATER_LEVEL, 0, MAX_WATER_LEVEL]) {
      for (const distance of [-5, -1.8, -0.5, 0, 0.5, 1.8, 5]) {
        const height = water + distance
        expect(softenShoreHeight(height, water, 0)).toBe(height)
        if (Math.abs(distance) >= SHORE_BLEND_HEIGHT || distance === 0) {
          expect(softenShoreHeight(height, water, 1)).toBeCloseTo(height, 12)
        }
      }
    }
  })

  test("higher values gently compress both sides without inverting slopes or crossing sea level", () => {
    for (const amount of [0, 0.5, 1]) {
      let previousHeight = -Infinity
      for (let index = -240; index <= 240; index += 1) {
        const distance = index / 100
        const result = softenShoreHeight(distance, 0, amount)
        expect(result).toBeGreaterThan(previousHeight)
        expect(Math.sign(result)).toBe(Math.sign(distance))
        expect(Math.abs(result)).toBeLessThanOrEqual(Math.abs(distance))
        expect(Math.abs(softenShoreHeight(distance, 0, 1))).toBeLessThanOrEqual(Math.abs(result))
        previousHeight = result
      }
    }
    const slopeAtSeaLevel = softenShoreHeight(0.0001, 0, 1) / 0.0001
    expect(slopeAtSeaLevel).toBeCloseTo(0.15, 5)
    // The coastal curve rejoins the unchanged inland slope without a hard step.
    const slopeAtJoin = (SHORE_BLEND_HEIGHT - softenShoreHeight(SHORE_BLEND_HEIGHT - 0.0001, 0, 1)) / 0.0001
    expect(slopeAtJoin).toBeCloseTo(1, 3)
    expect(softenShoreHeight(0.4, 0, -1)).toBe(0.4)
    expect(softenShoreHeight(0.4, 0, 2)).toBe(softenShoreHeight(0.4, 0, 1))
  })

  test("shore shaping follows the current water level after Gaussian smoothing", () => {
    for (const smoothing of [0, 0.6, 1]) {
      for (const waterLevel of [MIN_WATER_LEVEL, 0, MAX_WATER_LEVEL]) {
        const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64, smoothing, waterLevel }
        const original = createIslandHeightfield(settings)
        const softened = createIslandHeightfield({ ...settings, shoreSoftness: 1 })
        expect(softened.heights).toEqual(createIslandHeightfield({ ...settings, shoreSoftness: 1 }).heights)
        let changed = 0
        for (let row = 1; row < 64; row += 1) {
          for (let column = 1; column < 64; column += 1) {
            const index = row * 65 + column
            const height = original.heights[index]
            expect(softened.heights[index]).toBe(Math.fround(softenShoreHeight(height, waterLevel, 1)))
            if (softened.heights[index] !== height) changed += 1
          }
        }
        expect(changed).toBeGreaterThan(0)
      }
    }
  })

  test("soft beaches and the shore ramp broaden together", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 128 }
    const original = createIslandHeightfield(settings)
    let previousBeachSize = 0
    let previousShoreSize = 0
    for (const shoreSoftness of [0, 0.5, 1]) {
      const currentSettings = { ...settings, shoreSoftness }
      const field = createIslandHeightfield(currentSettings)
      const beachSize = field.heights.filter((height) => height > 0 && height <= 0.42).length
      const { data } = createShorelineDepthMap(currentSettings, field)
      // Texels that are neither dry land (0) nor open ocean (255) are the ramp.
      const rampSize = data.reduce(
        (total, depth) => total + (depth > 0 && depth < 255 ? 1 : 0),
        0,
      )

      expect(beachSize).toBeGreaterThan(previousBeachSize)
      expect(rampSize).toBeGreaterThan(previousShoreSize)
      previousBeachSize = beachSize
      previousShoreSize = rampSize
      for (let index = 0; index < field.heights.length; index += 1) {
        if (original.heights[index] >= SHORE_BLEND_HEIGHT) {
          expect(field.heights[index]).toBe(original.heights[index])
        }
      }
    }
  })

  test("scene and independent mesh builders share deterministic heights and colors", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64, smoothing: 0.5, shoreSoftness: 0.75 }
    const field = createIslandHeightfield(settings)
    const terrain = createIslandGeometry(settings, field)
    const independentTerrain = createIslandGeometry(settings)
    try {
      for (const attribute of ["position", "color"]) {
        expect(terrain.getAttribute(attribute).array).toEqual(independentTerrain.getAttribute(attribute).array)
      }
      expect(createShorelineDepthMap(settings, field).data).toEqual(
        createShorelineDepthMap(settings).data,
      )
      const positions = terrain.getAttribute("position")
      for (let index = 0; index < positions.count; index += 1) {
        expect(positions.getY(index)).toBeCloseTo(sampleIslandHeight(
          positions.getX(index), positions.getZ(index), settings, field,
        ), 6)
      }
      expect(sampleIslandHeight(2, 3, settings)).toBe(sampleIslandHeight(2, 3, settings, field))
    } finally {
      for (const geometry of [terrain, independentTerrain]) geometry.dispose()
    }
  })

  test("softness without Gaussian smoothing samples the reshaped profile", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64, shoreSoftness: 1 }
    const field = createIslandHeightfield(settings)
    expect(sampleIslandHeight(1, 2, settings)).toBe(sampleIslandHeight(1, 2, settings, field))
  })

  test("maximum softness keeps the seabed perimeter submerged at extreme settings and 512 resolution", () => {
    for (const resolution of [64, 512]) {
      for (const smoothing of [0, 1]) {
        for (const waterLevel of [MIN_WATER_LEVEL, MAX_WATER_LEVEL]) {
          for (const elevation of [2.4, 12]) {
            const settings = {
              ...DEFAULT_ISLAND_SETTINGS, seed: 0x7fffffff,
              resolution, smoothing, waterLevel, elevation, shoreSoftness: 1,
              islandSize: 1.4, persistence: 1.7, lacunarity: 2.32,
              noiseScale: 0.152, offsetX: 100, offsetY: -100,
            }
            const { heights } = createIslandHeightfield(settings)
            const stride = resolution + 1
            for (let edge = 0; edge < stride; edge += 1) {
              for (const index of [edge, resolution * stride + edge, edge * stride, edge * stride + resolution]) {
                expect(Math.max(ISLAND_BASE_LEVEL, heights[index])).toBeCloseTo(ISLAND_BASE_LEVEL, 6)
                expect(heights[index]).toBeLessThan(waterLevel)
              }
            }
          }
        }
      }
    }
  })
})
