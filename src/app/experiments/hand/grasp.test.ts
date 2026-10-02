import { expect, test } from 'bun:test'

import {
  DEPTH_ANGLE,
  DEPTH_BACK,
  DEPTH_FRONT,
  GRAB_BAND,
  GRAB_RADIUS,
  RELEASE_BAND,
  REACH_RADIUS,
  depthAt,
  depthOffset,
  nextHeld,
  reachFor,
} from './grasp'

const flat = { angle: 0, aspect: 1 }

test('depth runs from in front of the hand on the left to behind it on the right', () => {
  const grip = { x: 0.15, y: 0.2, z: 0.3 }
  expect(depthAt({ x: -1, y: 0 }, grip, flat)).toBeCloseTo(grip.z + DEPTH_FRONT)
  expect(depthAt({ x: grip.x, y: 0.9 }, grip, flat)).toBeCloseTo(grip.z)
  expect(depthAt({ x: 1, y: -0.5 }, grip, flat)).toBeCloseTo(grip.z - DEPTH_BACK)
  let previous = Infinity
  for (let x = -1; x <= 1; x += 0.05) {
    const depth = depthAt({ x, y: 0 }, grip, flat)
    expect(depth).toBeLessThan(previous)
    previous = depth
  }
})

test('a tilted axis runs from the bottom-left corner to the top-right', () => {
  const grip = { x: 0, y: 0, z: 0 }
  const axis = { angle: DEPTH_ANGLE, aspect: 1.5 }
  expect(depthAt({ x: -1, y: -1 }, grip, axis)).toBeCloseTo(DEPTH_FRONT)
  expect(depthAt({ x: 1, y: 1 }, grip, axis)).toBeCloseTo(-DEPTH_BACK)
  // Moving straight across the axis, on screen, keeps the same depth.
  const across = { x: -Math.sin(DEPTH_ANGLE) * 0.3, y: Math.cos(DEPTH_ANGLE) * 0.3 * 1.5 }
  expect(depthAt(across, grip, axis)).toBeCloseTo(0)
})

test('at 90° only vertical movement changes depth', () => {
  const grip = { x: 0.2, y: 0, z: 0 }
  const axis = { angle: Math.PI / 2, aspect: 1.2 }
  expect(depthAt({ x: -1, y: 0 }, grip, axis)).toBeCloseTo(0)
  expect(depthAt({ x: 1, y: 0 }, grip, axis)).toBeCloseTo(0)
  expect(depthAt({ x: 0, y: -1 }, grip, axis)).toBeCloseTo(DEPTH_FRONT)
  expect(depthAt({ x: 0, y: 1 }, grip, axis)).toBeCloseTo(-DEPTH_BACK)
})

test('at 0° the depth offset is just the horizontal offset', () => {
  expect(
    depthOffset({ x: 0.4, y: -0.7 }, { x: 0.1, y: 0.3 }, { angle: 0, aspect: 1.7 }),
  ).toBeCloseTo(0.3)
})

test('the front and back reaches can be tuned independently', () => {
  const grip = { x: 0, y: 0, z: 0 }
  expect(depthAt({ x: -1, y: 0 }, grip, flat, 3, 0.5)).toBeCloseTo(3)
  expect(depthAt({ x: 1, y: 0 }, grip, flat, 3, 0.5)).toBeCloseTo(-0.5)
  expect(depthAt({ x: 0, y: 0.5 }, grip, flat, 3, 0.5)).toBeCloseTo(0)
})

test('a grip at the very edge of the screen still maps to finite depths', () => {
  for (const x of [-1, -1.4, 1, 1.4])
    for (const angle of [0, DEPTH_ANGLE])
      for (const pointer of [-1, 0, 1])
        expect(
          Number.isFinite(depthAt({ x: pointer, y: 0 }, { x, y: 1.2, z: 0 }, { angle, aspect: 1 })),
        ).toBe(true)
})

test('the hand closes only on a nearby ball under an active pointer', () => {
  const near = { distance: GRAB_RADIUS * 0.5, offset: 0, active: true }
  expect(nextHeld(false, near)).toBe(true)
  expect(nextHeld(false, { ...near, active: false })).toBe(false)
  expect(nextHeld(false, { ...near, distance: GRAB_RADIUS * 1.5 })).toBe(false)
  expect(nextHeld(false, { ...near, offset: GRAB_BAND * 1.5 })).toBe(false)
})

test('a held ball survives vertical moves and is released left or right', () => {
  const far = { distance: 5, active: true }
  expect(nextHeld(true, { ...far, offset: 0 })).toBe(true)
  expect(nextHeld(true, { ...far, offset: RELEASE_BAND * 0.9 })).toBe(true)
  expect(nextHeld(true, { ...far, offset: -RELEASE_BAND * 1.1 })).toBe(false)
  expect(nextHeld(true, { ...far, offset: RELEASE_BAND * 1.1 })).toBe(false)
  // Leaving the window keeps the ball in the hand.
  expect(nextHeld(true, { distance: 5, offset: 2, active: false })).toBe(true)
})

test('a release never lands back inside the grab band', () => {
  expect(RELEASE_BAND).toBeGreaterThan(GRAB_BAND)
})

test('the fingers anticipate only as the ball comes near', () => {
  expect(reachFor(REACH_RADIUS * 2)).toBe(0)
  expect(reachFor(GRAB_RADIUS)).toBe(1)
  expect(reachFor((REACH_RADIUS + GRAB_RADIUS) / 2)).toBeCloseTo(0.5)
})
