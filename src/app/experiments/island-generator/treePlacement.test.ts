import { describe, expect, test } from "bun:test"

import {
  createIslandHeightfield,
  DEFAULT_ISLAND_SETTINGS,
  HIGH_GRASS_START,
  MIN_ELEVATION,
  peakAboveWater,
  sampleIslandHeight,
} from "./terrain"
import { createTreePlacements } from "./treePlacement"

describe("tree placement", () => {
  const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 128 }
  const heightfield = createIslandHeightfield(settings)
  const placements = createTreePlacements(settings, heightfield)

  test("plants a wood", () => {
    expect(placements.count).toBeGreaterThan(50)
    expect(placements.positions.length).toBe(placements.count * 3)
    expect(placements.scales.length).toBe(placements.count)
    expect(placements.rotations.length).toBe(placements.count)
  })

  test("every tree stands in the high-grass band, on the ground", () => {
    const peak = peakAboveWater(heightfield.heights, settings.waterLevel)

    for (let index = 0; index < placements.count; index += 1) {
      const x = placements.positions[index * 3]
      const y = placements.positions[index * 3 + 1]
      const z = placements.positions[index * 3 + 2]

      // Sits on the surface rather than hovering or sunk into it.
      expect(y).toBeCloseTo(sampleIslandHeight(x, z, settings, heightfield), 5)
      expect((y - settings.waterLevel) / peak).toBeGreaterThanOrEqual(HIGH_GRASS_START)
    }
  })

  test("the same seed plants the same wood", () => {
    expect(createTreePlacements(settings, heightfield).positions).toEqual(
      placements.positions,
    )
  })

  test("a different seed plants a different one", () => {
    const other = createTreePlacements(
      { ...settings, seed: settings.seed + 1 },
      createIslandHeightfield({ ...settings, seed: settings.seed + 1 }),
    )
    expect(other.positions).not.toEqual(placements.positions)
  })

  test("a drowned island grows nothing", () => {
    // The sea has to clear the summit outright. At the default elevation a
    // 3.5 water level still leaves 0.06 of peak standing, which is land.
    const drowned = { ...settings, elevation: MIN_ELEVATION, waterLevel: 3.5 }
    const field = createIslandHeightfield(drowned)
    expect(peakAboveWater(field.heights, drowned.waterLevel)).toBe(0)
    expect(createTreePlacements(drowned, field).count).toBe(0)
  })
})
