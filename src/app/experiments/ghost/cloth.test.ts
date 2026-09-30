import { expect, test } from 'bun:test'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { GhostCloth, HEAD_Y } from './cloth'
import { IDLE_DURATION, sampleIdle, type IdlePose } from './idle'

function headPose(yaw: number, pitch = 0) {
  return new Matrix4()
    .compose(
      new Vector3(0, HEAD_Y, 0),
      new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ')),
      new Vector3(1, 1, 1),
    )
    .multiply(new Matrix4().makeTranslation(0, -HEAD_Y, 0))
}

test('the eye region follows the current gaze on frames without a physics step', () => {
  const cloth = new GhostCloth()
  try {
    const pose = headPose(0.58, -0.16)
    cloth.update(1 / 240, pose, 0.35)
    for (let i = 0; i < cloth.rest.length; i += 3) {
      const x = cloth.rest[i]
      const y = cloth.rest[i + 1]
      const z = cloth.rest[i + 2]
      if (y < 2.0 || y > 2.3 || z < 0.45 || Math.abs(x) > 0.36) continue
      const expected = new Vector3().fromArray(cloth.rest, i).applyMatrix4(pose)
      expect(new Vector3().fromArray(cloth.positions, i).distanceTo(expected)).toBeLessThan(
        0.000001,
      )
    }
    const expectedCrown = new Vector3().fromArray(cloth.rest).applyMatrix4(pose)
    const renderedCrown = new Vector3().fromBufferAttribute(
      cloth.geometry.getAttribute('position'),
      0,
    )
    expect(renderedCrown.distanceTo(expectedCrown)).toBeLessThan(0.000001)
  } finally {
    cloth.dispose()
  }
})

test('the loose crown moves while staying outside the dark head interior', () => {
  const cloth = new GhostCloth()
  try {
    const pose = headPose(0.5, 0.12)
    for (let frame = 0; frame < 120; frame++) cloth.update(1 / 60, pose, 0.8)
    let looseCrownMovement = 0
    for (let i = 0; i < cloth.rest.length; i += 3) {
      if (cloth.rest[i + 1] < 2.05 || cloth.rest[i + 1] > 2.58) continue
      const point = new Vector3().fromArray(cloth.positions, i)
      // The dark backing has a 0.6 radius; leave a visible fabric gap even
      // where the face anchors hold an inward fold against the head.
      expect(point.distanceTo(new Vector3(0, HEAD_Y, 0))).toBeGreaterThan(0.61)
      if (cloth.rest[i + 2] < 0) {
        const supported = new Vector3().fromArray(cloth.rest, i).applyMatrix4(pose)
        looseCrownMovement += point.distanceTo(supported)
      }
    }
    expect(looseCrownMovement).toBeGreaterThan(1)
  } finally {
    cloth.dispose()
  }
})

test('cloth keeps its volume under wind, changing gaze and a suspended frame', () => {
  const cloth = new GhostCloth()
  try {
    const initial = cloth.positions.slice()
    for (let frame = 0; frame < 240; frame++) {
      cloth.update(1 / 60, headPose(Math.sin(frame * 0.06) * 0.58, 0.15), 1)
    }
    const pose = headPose(-0.58, -0.16)
    cloth.update(10, pose, 1)
    let movement = 0
    let minY = Infinity
    let maxRadius = 0
    for (let i = 0; i < cloth.positions.length; i += 3) {
      const point = new Vector3().fromArray(cloth.positions, i)
      expect(Number.isFinite(point.x + point.y + point.z)).toBe(true)
      minY = Math.min(minY, point.y)
      maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.z))
      movement += point.distanceTo(new Vector3().fromArray(initial, i))
    }
    expect(minY).toBeGreaterThanOrEqual(0.099)
    expect(maxRadius).toBeLessThan(1.3)
    expect(movement).toBeGreaterThan(10)
    // The supported crown follows the head exactly while the hem can lag.
    const crown = new Vector3().fromArray(cloth.rest).applyMatrix4(pose)
    expect(new Vector3().fromArray(cloth.positions).distanceTo(crown)).toBeLessThan(0.000001)
  } finally {
    cloth.dispose()
  }
})

test('cloth settles consistently at different render frame rates', () => {
  const fast = new GhostCloth()
  const slow = new GhostCloth()
  try {
    const pose = headPose(0.3)
    for (let frame = 0; frame < 240; frame++) fast.update(1 / 120, pose, 0.6)
    for (let frame = 0; frame < 60; frame++) slow.update(1 / 30, pose, 0.6)
    let difference = 0
    for (let i = 0; i < fast.positions.length; i++) {
      difference = Math.max(difference, Math.abs(fast.positions[i] - slow.positions[i]))
    }
    expect(difference).toBeLessThan(0.003)
  } finally {
    fast.dispose()
    slow.dispose()
  }
})

test('the UV seam stays closed and smoothly lit after deformation', () => {
  const cloth = new GhostCloth()
  try {
    for (let frame = 0; frame < 45; frame++) cloth.update(1 / 60, headPose(0.5), 0.9)
    const uv = cloth.geometry.getAttribute('uv')
    const positions = cloth.geometry.getAttribute('position')
    const normals = cloth.geometry.getAttribute('normal')
    for (let i = 0; i < uv.count; i++) {
      if (uv.getX(i) !== 0) continue
      let end = i + 1
      while (uv.getX(end) !== 1) end++
      expect(
        new Vector3()
          .fromBufferAttribute(positions, i)
          .distanceTo(new Vector3().fromBufferAttribute(positions, end)),
      ).toBe(0)
      expect(
        new Vector3()
          .fromBufferAttribute(normals, i)
          .distanceTo(new Vector3().fromBufferAttribute(normals, end)),
      ).toBe(0)
    }
  } finally {
    cloth.dispose()
  }
})

test('cloth stays above the world floor while bouncing and spinning', () => {
  const cloth = new GhostCloth()
  const sampled = {} as IdlePose
  const body = new Matrix4()
  const point = new Vector3()
  let lowest = Infinity
  let furthest = 0
  let finite = true
  try {
    for (let frame = 0; frame <= IDLE_DURATION.dance * 30; frame++) {
      const pose = sampleIdle('dance', frame / 30, sampled)
      const width = 1 / Math.sqrt(pose.stretch)
      body.compose(
        new Vector3(pose.x, pose.y + 0.045, pose.z),
        new Quaternion().setFromEuler(new Euler(pose.pitch, pose.yaw, pose.roll, 'YXZ')),
        new Vector3(width, pose.stretch, width),
      )
      cloth.update(1 / 30, headPose(pose.headYaw, pose.headPitch), 0.35, body)
      for (let i = 0; i < cloth.positions.length; i += 3) {
        point.fromArray(cloth.positions, i).applyMatrix4(body)
        finite &&= Number.isFinite(point.x + point.y + point.z)
        lowest = Math.min(lowest, point.y)
        furthest = Math.max(
          furthest,
          Math.hypot(cloth.positions[i], cloth.positions[i + 1], cloth.positions[i + 2]),
        )
      }
    }
    expect(finite).toBe(true)
    expect(lowest).toBeGreaterThanOrEqual(0.059)
    expect(furthest).toBeLessThan(3)
    // After dancing the sheet recovers its relaxed hanging silhouette.
    for (let frame = 0; frame < 45; frame++) cloth.update(1 / 30, headPose(0), 0.35, body)
    let hemTop = -Infinity
    for (let i = cloth.positions.length - 64 * 3; i < cloth.positions.length; i += 3) {
      hemTop = Math.max(hemTop, cloth.positions[i + 1])
    }
    expect(hemTop).toBeLessThan(0.5)
  } finally {
    cloth.dispose()
  }
})
