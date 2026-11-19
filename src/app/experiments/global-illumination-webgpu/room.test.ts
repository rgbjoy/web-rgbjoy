import { afterEach, expect, test } from 'bun:test'
import { Quaternion, Vector3 } from 'three'

import { allPoses, inverseTurn, keepInRoom, OBJECTS, pickObject, resetObjects, rotatable, torusDistance } from './room'

afterEach(resetObjects)

const toward = (from: Vector3, to: Vector3) => to.clone().sub(from).normalize()

test('a ray from inside the room picks what it meets first', () => {
  const eye = new Vector3(-2.2, 2.7, 5.2)
  expect(pickObject(eye, toward(eye, OBJECTS.glow.position))).toBe('glow')
  expect(pickObject(eye, toward(eye, OBJECTS.pebble.position))).toBe('pebble')
  expect(pickObject(eye, toward(eye, OBJECTS.block.position))).toBe('block')
  // Its centre is the hole; its rim is what's there to click — the top of
  // it, as the orange sphere stands in front of the bottom.
  const rim = new Vector3(0, 0, -0.86).applyQuaternion(OBJECTS.torus.quaternion).add(OBJECTS.torus.position)
  expect(pickObject(eye, toward(eye, rim))).toBe('torus')
  // Straight up at the ceiling: nothing.
  expect(pickObject(eye, new Vector3(0, 1, 0))).toBeNull()
})

test('the nearer of two objects in line wins', () => {
  OBJECTS.pebble.position.set(0, 1, 0)
  OBJECTS.glow.position.set(0, 1, -3)
  const eye = new Vector3(0, 1, 4)
  expect(pickObject(eye, new Vector3(0, 0, -1))).toBe('pebble')
})

test('from outside, only what shows through the window can be picked', () => {
  OBJECTS.block.position.set(0, 2.3, -2)
  // The torus hangs in the window's light; out of the way.
  OBJECTS.torus.position.set(0, 2.3, 4)
  // Level with the window, looking in through it.
  const window = new Vector3(14, 2.3, -2)
  expect(pickObject(window, new Vector3(-1, 0, 0))).toBe('block')
  // Same line of sight through the solid wall beside it.
  const wall = new Vector3(14, 2.3, 3)
  expect(pickObject(wall, toward(wall, new Vector3(0, 2.3, 3)))).toBeNull()
})

test('a turned block is picked by its own corners, not its upright box', () => {
  OBJECTS.block.position.set(0, 1, 0)
  OBJECTS.block.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4)
  const eye = new Vector3(-3, 1, 3)
  // A diagonal corner of the turned block reaches x = 1.41; the upright one would stop at 1.
  expect(pickObject(eye, toward(eye, new Vector3(1.3, 1, 0)))).toBe('block')
  // Through where the upright box's corner would be — x + z = 1.75 — but
  // outside the turned one's diamond (|x| + |z| ≤ 1.44): a miss.
  const corner = new Vector3(-1.25, 1, 3)
  expect(pickObject(corner, new Vector3(1, 0, -1).normalize())).toBeNull()
})

test('a torus is picked by its tube, and looked through at its hole', () => {
  OBJECTS.torus.position.set(0, 2, 0)
  OBJECTS.torus.quaternion.identity()
  // Straight down onto it as it lies flat.
  const eye = new Vector3(0, 4, 0)
  const down = new Vector3(0, -1, 0)
  expect(pickObject(eye.clone().setX(0.72), down)).toBe('torus')
  expect(pickObject(eye.clone().setZ(-0.9), down)).toBe('torus')
  // Through the hole, and past the rim: nothing.
  expect(pickObject(eye, down)).toBeNull()
  expect(pickObject(eye.clone().setX(1.05), down)).toBeNull()
})

test('the torus’s distance is exact: the tube’s radius from its core circle', () => {
  expect(torusDistance(0.72, 0, 0)).toBeCloseTo(-0.28)
  expect(torusDistance(0, 0, 0)).toBeCloseTo(0.44)
  expect(torusDistance(0, 1, -0.72)).toBeCloseTo(0.72)
})

test('an inverse rotation undoes its object’s turn', () => {
  for (const name of ['block', 'torus'] as const) {
    OBJECTS[name].quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(1, 1, 0).normalize(), 0.7))
    const v = new Vector3(0.3, -0.2, 0.9)
    const turned = v.clone().applyQuaternion(OBJECTS[name].quaternion)
    expect(turned.applyMatrix3(inverseTurn(name)).distanceTo(v)).toBeLessThan(1e-9)
  }
})

test('objects stay inside the room, clear of its walls', () => {
  const p = keepInRoom('glow', new Vector3(10, -4, -20))
  expect(p.toArray()).toEqual([2.5, 1, -5])
  expect(keepInRoom('pebble', new Vector3(0, 0, 0)).y).toBe(0.55)
  // The torus keeps its whole reach clear, so its rim never cuts into a wall.
  expect(keepInRoom('torus', new Vector3(0, 0, 0)).y).toBe(1)
})

test('poses read back as plain numbers, turns in degrees', () => {
  OBJECTS.pebble.position.set(0.5, 0.55, -1)
  const poses = allPoses()
  expect(poses.pebble).toEqual({ position: [0.5, 0.55, -1], rotation: null })
  // The torus stands on edge, then turns 20° towards the window.
  const [x, y, z] = poses.torus.rotation!
  expect(x).toBeCloseTo(90)
  expect(y).toBeCloseTo(0)
  expect(z).toBeCloseTo(-20.05, 1)
  // A snapshot: moving on afterwards doesn't change it.
  OBJECTS.pebble.position.x = 2
  expect(poses.pebble.position[0]).toBe(0.5)
})

test('only the block and the torus turn', () => {
  expect(rotatable('block')).toBe(true)
  expect(rotatable('torus')).toBe(true)
  expect(rotatable('glow')).toBe(false)
  expect(rotatable('pebble')).toBe(false)
})
