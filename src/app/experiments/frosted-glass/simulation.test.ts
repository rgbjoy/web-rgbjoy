import { describe, expect, test } from "bun:test"

import { rotateAxis } from "./simulation"
import type { b3Quat, b3Vec3 } from "box3d.js"

/** Half the distance between a capsule's two end caps. */
const LENGTH = 0.4

function rotated(quaternion: b3Quat, length = LENGTH) {
  const out: b3Vec3 = [0, 0, 0]
  rotateAxis(out, quaternion, length)
  return out
}

function normalized([x, y, z, w]: b3Quat): b3Quat {
  const scale = 1 / Math.hypot(x, y, z, w)
  return [x * scale, y * scale, z * scale, w * scale]
}

const SQRT_HALF = Math.SQRT1_2

describe("rotateAxis", () => {
  test("identity leaves the axis pointing up", () => {
    expect(rotated([0, 0, 0, 1])).toEqual([0, LENGTH, 0])
  })

  test("a quarter turn about z lays the capsule along -x", () => {
    const [x, y, z] = rotated([0, 0, SQRT_HALF, SQRT_HALF])

    expect(x).toBeCloseTo(-LENGTH, 12)
    expect(y).toBeCloseTo(0, 12)
    expect(z).toBeCloseTo(0, 12)
  })

  test("a quarter turn about x lays the capsule along +z", () => {
    const [x, y, z] = rotated([SQRT_HALF, 0, 0, SQRT_HALF])

    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(0, 12)
    expect(z).toBeCloseTo(LENGTH, 12)
  })

  test("a turn about y leaves the axis alone", () => {
    const [x, y, z] = rotated([0, SQRT_HALF, 0, SQRT_HALF])

    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(LENGTH, 12)
    expect(z).toBeCloseTo(0, 12)
  })

  // A rotation cannot change how far the end cap sits from the centre; if it
  // did, capsules would stretch and shrink as they tumbled.
  test("every rotation preserves the half-length", () => {
    const quaternions: b3Quat[] = [
      [0.3, -0.5, 0.7, 0.2],
      [-1, 2, -3, 4],
      [0.1, 0.1, 0.1, 0.99],
      [5, 0, 0, 0],
    ]

    for (const quaternion of quaternions) {
      const [x, y, z] = rotated(normalized(quaternion))
      expect(Math.hypot(x, y, z)).toBeCloseTo(LENGTH, 12)
    }
  })

  test("a zero half-length collapses a bead to its centre", () => {
    // Signed zeros are still zeros here, so compare component by component.
    for (const component of rotated([0.3, 0.4, 0.5, Math.sqrt(0.5)], 0)) {
      expect(component).toBeCloseTo(0, 12)
    }
  })
})
