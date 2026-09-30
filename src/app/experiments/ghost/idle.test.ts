import { expect, test } from 'bun:test'
import { Euler, Quaternion } from 'three'

import {
  IDLE_DURATION,
  IDLE_ROUTINES,
  IdleDirector,
  sampleIdle,
  type IdlePose,
  type IdleRoutine,
} from './idle'

const pose = () => ({}) as IdlePose

test('random idle selection gives every routine a turn without consecutive repeats', () => {
  let seed = 17
  const director = new IdleDirector(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  })
  const routines: IdleRoutine[] = []
  for (let step = 0; step < 6000 && routines.length < 12; step++) {
    const before = director.activity
    director.update(0.1, false, false)
    if (before === 'waiting' && director.activity !== 'waiting') {
      routines.push(director.activity)
    }
  }
  expect(routines).toHaveLength(12)
  for (let i = 0; i < routines.length; i += IDLE_ROUTINES.length) {
    expect(new Set(routines.slice(i, i + IDLE_ROUTINES.length))).toEqual(new Set(IDLE_ROUTINES))
  }
  for (let i = 1; i < routines.length; i++) expect(routines[i]).not.toBe(routines[i - 1])
})

test('finding the pointer ends the search and idle routines wait during eye contact', () => {
  const director = new IdleDirector(() => 0.5)
  director.start('search')
  expect(director.update(2, false, false).squint).toBeGreaterThan(0.5)
  expect(director.update(1 / 60, true, false).squint).toBe(0)
  expect(director.activity).toBe('waiting')
  for (let frame = 0; frame < 600; frame++) director.update(1 / 30, true, false)
  expect(director.activity).toBe('waiting')
  director.update(10, false, false)
  expect(director.activity).not.toBe('waiting')
})

test('reduced motion settles to a neutral pose and prevents performances', () => {
  const director = new IdleDirector()
  director.start('dance')
  expect(director.update(4, false, false).y).toBeGreaterThan(0)
  const still = director.update(1 / 60, false, true)
  expect(director.activity).toBe('waiting')
  expect(still.roll).toBe(0)
  expect(still.y).toBe(0)
  for (let step = 0; step < 30; step++) director.update(1, false, true)
  expect(director.activity).toBe('waiting')
})

test('the dance makes one full turn and finishes without unwinding', () => {
  let previous = 0
  for (let t = 0; t <= IDLE_DURATION.dance; t += 0.05) {
    const yaw = sampleIdle('dance', t, pose()).yaw
    expect(yaw).toBeGreaterThanOrEqual(previous)
    expect(yaw).toBeLessThanOrEqual(Math.PI * 2)
    previous = yaw
  }
  expect(previous).toBeCloseTo(Math.PI * 2, 8)
})

test('every routine enters and leaves the resting pose smoothly', () => {
  for (const routine of IDLE_ROUTINES) {
    for (const time of [0, IDLE_DURATION[routine]]) {
      const sampled = sampleIdle(routine, time, pose())
      const rotation = new Quaternion().setFromEuler(
        new Euler(sampled.pitch, sampled.yaw, sampled.roll, 'YXZ'),
      )
      expect(rotation.angleTo(new Quaternion())).toBeLessThan(0.000001)
      expect(Math.hypot(sampled.x, sampled.y, sampled.z)).toBe(0)
      expect(sampled.stretch).toBe(1)
      expect(sampled.squint).toBe(0)
    }
    const before = sampleIdle(routine, IDLE_DURATION[routine] - 0.001, pose())
    const after = sampleIdle('waiting', 0, pose())
    expect(Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z)).toBeLessThan(
      0.00001,
    )
    expect(Math.abs(before.roll - after.roll)).toBeLessThan(0.00001)
  }
})
