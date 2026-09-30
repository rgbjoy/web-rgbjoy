import { expect, test } from 'bun:test'
import { stepCharge } from './charge'

test('holding builds to full power and releasing returns to rest', () => {
  let level = 0
  for (let i = 0; i < 144; i++) level = stepCharge(level, true, 1 / 60)
  expect(level).toBeCloseTo(1, 6)
  for (let i = 0; i < 72; i++) level = stepCharge(level, false, 1 / 60)
  expect(level).toBeCloseTo(0, 6)
})

test('charge timing is consistent at different frame rates', () => {
  const levels = [30, 60, 120].map((fps) => {
    let level = 0
    for (let frame = 0; frame < fps; frame++) level = stepCharge(level, true, 1 / fps)
    for (let frame = 0; frame < fps / 4; frame++) level = stepCharge(level, false, 1 / fps)
    return level
  })
  expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.015)
})

test('a suspended frame cannot finish the charge or push it outside its range', () => {
  expect(stepCharge(0, true, 10)).toBeLessThan(0.05)
  expect(stepCharge(0, false, 1 / 60)).toBe(0)
  expect(stepCharge(1, true, 1 / 60)).toBe(1)
  expect(stepCharge(0.5, true, -1)).toBe(0.5)
})
