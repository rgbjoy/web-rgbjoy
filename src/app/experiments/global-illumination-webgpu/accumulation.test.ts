import { expect, test } from 'bun:test'

import { Accumulator, cameraMoved } from './accumulation'

test('blending each frame at its weight leaves the plain mean', () => {
  const accumulator = new Accumulator(64)
  const frames = [0.9, 0.1, 0.4, 0.7, 0.2, 0.5]

  let target = 0
  for (const frame of frames) {
    const { weight } = accumulator.next(true, false)
    target += (frame - target) * weight
  }

  const mean = frames.reduce((sum, frame) => sum + frame, 0) / frames.length
  expect(target).toBeCloseTo(mean, 12)
})

test('the first frame starts fresh, the rest build on it', () => {
  const accumulator = new Accumulator(64)

  expect(accumulator.next(true, false)).toMatchObject({ mode: 'fresh', weight: 1 })
  expect(accumulator.next(true, false)).toMatchObject({ mode: 'rest', weight: 1 / 2 })
  expect(accumulator.next(true, false)).toMatchObject({ mode: 'rest', weight: 1 / 3 })
})

test('moving restarts the run, and resting picks it up from the next frame', () => {
  const accumulator = new Accumulator(64)
  for (let i = 0; i < 5; i++) accumulator.next(true, false)

  expect(accumulator.next(true, true)).toMatchObject({ mode: 'moving', weight: 1, jitterX: 0.5, jitterY: 0.5 })
  expect(accumulator.samples).toBe(0)
  expect(accumulator.next(true, false)).toMatchObject({ mode: 'rest', weight: 1 })
  expect(accumulator.next(true, false)).toMatchObject({ mode: 'rest', weight: 1 / 2 })
})

test('a reset throws everything away, even mid-move', () => {
  const accumulator = new Accumulator(64)
  accumulator.next(true, false)
  accumulator.reset()

  expect(accumulator.next(true, true).mode).toBe('fresh')
  expect(accumulator.next(true, true).mode).toBe('moving')
})

test('stops tracing at the limit and starts over on reset', () => {
  const accumulator = new Accumulator(3)
  for (let i = 0; i < 3; i++) accumulator.next(true, false)

  expect(accumulator.pending(true)).toBe(false)
  accumulator.reset()
  expect(accumulator.pending(true)).toBe(true)
})

test('noise keeps moving across restarts', () => {
  const accumulator = new Accumulator(64)
  const indices = new Set<number>()
  for (let i = 0; i < 10; i++) {
    indices.add(accumulator.next(true, i % 2 === 0).index)
    if (i === 4) accumulator.reset()
  }
  expect(indices.size).toBe(10)
})

test('without accumulation, one raw frame and then nothing until something changes', () => {
  const accumulator = new Accumulator(64)

  expect(accumulator.pending(false)).toBe(true)
  expect(accumulator.next(false, false)).toMatchObject({
    mode: 'fresh',
    weight: 1,
    jitterX: 0.5,
    jitterY: 0.5,
  })
  expect(accumulator.pending(false)).toBe(false)

  // A move draws one more, and leaves it there.
  expect(accumulator.next(false, true).mode).toBe('fresh')
  expect(accumulator.pending(false)).toBe(false)

  accumulator.reset()
  expect(accumulator.pending(false)).toBe(true)
})

test('jitter stays inside the pixel and spreads across it', () => {
  const accumulator = new Accumulator(256)
  let left = 0
  for (let i = 0; i < 256; i++) {
    const { jitterX, jitterY } = accumulator.next(true, false)
    expect(jitterX).toBeGreaterThanOrEqual(0)
    expect(jitterX).toBeLessThan(1)
    expect(jitterY).toBeGreaterThanOrEqual(0)
    expect(jitterY).toBeLessThan(1)
    if (jitterX < 0.5) left++
  }
  expect(Math.abs(left - 128)).toBeLessThan(4)
})

test('only a visible change of camera counts as moving', () => {
  const still = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0))
  const crept = still.map((v, i) => (i === 12 ? v + 1e-6 : v))
  const turned = still.map((v, i) => (i === 2 ? v + 1e-3 : v))

  expect(cameraMoved(still, still)).toBe(false)
  expect(cameraMoved(still, crept)).toBe(false)
  expect(cameraMoved(still, turned)).toBe(true)
})
