import { expect, test } from 'bun:test'

import { FINGERS, LOOP_SECONDS, sampleLoop } from './loop'

test('the loop ends exactly where it starts', () => {
  const start = sampleLoop(0)
  const end = sampleLoop(LOOP_SECONDS)
  for (const finger of FINGERS) expect(end.curl[finger]).toBeCloseTo(start.curl[finger], 10)
  for (const key of ['thumb', 'sway', 'lift', 'light'] as const)
    expect(end[key]).toBeCloseTo(start[key], 10)
})

test('the little finger leads the ripple and the index follows', () => {
  const peak = (finger: (typeof FINGERS)[number]) => {
    let best = { at: 0, curl: -Infinity }
    for (let step = 0; step < 800; step++) {
      const at = (step / 800) * LOOP_SECONDS
      const curl = sampleLoop(at).curl[finger]
      if (curl > best.curl) best = { at, curl }
    }
    return best.at
  }
  expect(peak('Little')).toBeLessThan(peak('Ring'))
  expect(peak('Ring')).toBeLessThan(peak('Middle'))
  expect(peak('Middle')).toBeLessThan(peak('Index'))
})

test('fingers stay within a natural range', () => {
  for (let step = 0; step < 200; step++) {
    const pose = sampleLoop((step / 200) * LOOP_SECONDS)
    for (const finger of FINGERS) {
      expect(pose.curl[finger]).toBeGreaterThan(0)
      expect(pose.curl[finger]).toBeLessThan((70 * Math.PI) / 180)
    }
  }
})
