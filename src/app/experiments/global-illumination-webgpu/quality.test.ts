import { expect, test } from 'vitest'

import { AdaptiveScale } from './quality'

/** Feeds a steady frame time, a frame every 16 ms, for this many frames. */
function run(scale: AdaptiveScale, ms: number, frames: number, start = 0) {
  let now = start
  for (let i = 0; i < frames; i++) scale.sample(ms, (now += 16))
  return now
}

test('a GPU with room to spare keeps the full resolution', () => {
  const scale = new AdaptiveScale()
  run(scale, 7, 300)
  expect(scale.scale).toBe(1)
})

test('a slow GPU drops the resolution until the frame fits', () => {
  const scale = new AdaptiveScale()
  // Cost goes with the pixel count, the scale squared: 27 ms at full size.
  let now = 0
  for (let i = 0; i < 1000; i++) scale.sample(27 * scale.scale ** 2, (now += 16))
  expect(scale.scale).toBeLessThan(1)
  expect(27 * scale.scale ** 2).toBeLessThanOrEqual(12 * 1.25)
})

test('it never drops below its floor', () => {
  const scale = new AdaptiveScale()
  run(scale, 200, 2000)
  expect(scale.scale).toBe(0.5)
})

test('it climbs back once there is room again', () => {
  const scale = new AdaptiveScale()
  const now = run(scale, 40, 300)
  expect(scale.scale).toBeLessThan(1)
  run(scale, 3, 600, now)
  expect(scale.scale).toBe(1)
})

test('it waits for a settled average before judging', () => {
  const scale = new AdaptiveScale()
  run(scale, 40, 10)
  expect(scale.scale).toBe(1)
})
