import { expect, test } from 'bun:test'

import { blueNoiseRGBA, voidAndCluster } from './blueNoise'

const SIZE = 32

test('ranks every texel exactly once', () => {
  const rank = voidAndCluster(SIZE, 7)
  const seen = new Set(rank)

  expect(seen.size).toBe(SIZE * SIZE)
  expect(Math.min(...rank)).toBe(0)
  expect(Math.max(...rank)).toBe(SIZE * SIZE - 1)
})

test('the same seed gives the same texture', () => {
  expect(voidAndCluster(SIZE, 3)).toEqual(voidAndCluster(SIZE, 3))
})

/** Closest pair, in texels, among the texels ranked below `threshold`. */
function closestPair(rank: Uint32Array, threshold: number) {
  const points: [number, number][] = []
  rank.forEach((r, i) => {
    if (r < threshold) points.push([i % SIZE, Math.floor(i / SIZE)])
  })
  let closest = Infinity
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const dx = Math.abs(points[a][0] - points[b][0])
      const dy = Math.abs(points[a][1] - points[b][1])
      closest = Math.min(closest, Math.hypot(Math.min(dx, SIZE - dx), Math.min(dy, SIZE - dy)))
    }
  }
  return closest
}

test('sparse thresholds keep their points well apart', () => {
  // White noise puts two of them side by side long before this density.
  for (const seed of [5, 7, 11]) {
    const rank = voidAndCluster(SIZE, seed)
    expect(closestPair(rank, Math.round(SIZE * SIZE * 0.02))).toBeGreaterThanOrEqual(4)
    expect(closestPair(rank, Math.round(SIZE * SIZE * 0.05))).toBeGreaterThanOrEqual(3)
  }
})

test('neighbours differ more than white noise would', () => {
  // Blue noise has no low frequencies, so adjacent texels anticorrelate:
  // the mean gap between them sits well above white noise's 1/3.
  const rank = voidAndCluster(SIZE, 5)
  const count = SIZE * SIZE
  let gap = 0
  for (let i = 0; i < count; i++) {
    const right = i - (i % SIZE) + ((i + 1) % SIZE)
    gap += Math.abs(rank[i] - rank[right]) / count
  }

  expect(gap / count).toBeGreaterThan(0.4)
})

test('packs four independent layers into RGBA', () => {
  const data = blueNoiseRGBA(16)

  expect(data.length).toBe(16 * 16 * 4)
  const layers: number[][] = [[], [], [], []]
  data.forEach((value, i) => layers[i % 4].push(value))
  for (const layer of layers) {
    // 256 texels spread over 256 levels: every level used once.
    expect(new Set(layer).size).toBe(256)
  }
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) expect(layers[a]).not.toEqual(layers[b])
  }
})
