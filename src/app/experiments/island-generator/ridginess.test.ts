import { describe, expect, test } from "bun:test"

import { createIslandHeightfield, DEFAULT_ISLAND_SETTINGS } from "./terrain"

/** Mean absolute step between neighbouring land cells: how rugged the relief is. */
function relief(settings: Parameters<typeof createIslandHeightfield>[0]) {
  const { gridSegments, heights } = createIslandHeightfield(settings)
  const stride = gridSegments + 1
  let total = 0
  let samples = 0

  for (let row = 1; row < stride - 1; row += 1) {
    for (let column = 1; column < stride - 1; column += 1) {
      const index = row * stride + column
      if (heights[index] <= settings.waterLevel) continue
      total +=
        Math.abs(heights[index] - heights[index + 1]) +
        Math.abs(heights[index] - heights[index + stride])
      samples += 2
    }
  }

  return total / samples
}

function landFraction(settings: Parameters<typeof createIslandHeightfield>[0]) {
  const { heights } = createIslandHeightfield(settings)
  let land = 0
  for (let index = 0; index < heights.length; index += 1) {
    if (heights[index] > settings.waterLevel) land += 1
  }
  return land / heights.length
}

describe("ridginess", () => {
  const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 128 }

  test("rolling terrain is untouched, so old islands still generate the same", () => {
    const plain = createIslandHeightfield({ ...settings, ridginess: 0 })
    // Settings saved before the control existed arrive without the field.
    const legacy = createIslandHeightfield({
      ...settings,
      ridginess: undefined as unknown as number,
    })
    expect(plain.heights).toEqual(legacy.heights)
  })

  /* Checked end to end rather than step by step: the curve dips slightly over
     the first quarter, where folding the lattice flattens gradients before the
     octave weighting has ramped up enough to offset it. */
  test("raising ridginess sharpens the relief", () => {
    const rolling = relief({ ...settings, ridginess: 0 })
    const ridged = relief({ ...settings, ridginess: 1 })
    expect(ridged).toBeGreaterThan(rolling * 1.4)
  })

  /* RIDGE_OFFSET is a measured constant that keeps ridged octaves on the same
     mean as plain ones. Without it, sharpening the relief also sank the island:
     land fell from 23% to 14% across the slider. */
  test("sharpening the relief does not change how much land there is", () => {
    const baseline = landFraction({ ...settings, ridginess: 0 })
    for (const ridginess of [0.25, 0.5, 0.75, 1]) {
      expect(landFraction({ ...settings, ridginess })).toBeCloseTo(baseline, 1)
    }
  })
})
