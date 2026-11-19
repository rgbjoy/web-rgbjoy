import { expect, test } from 'vitest'
import { Matrix3, Matrix4, Vector3 } from 'three'

import { PLUS_BAR, PLUS_CENTER, plusHit, plusTurn } from './plus'

test('a ray straight at the plus stops on its front face', () => {
  const origin = PLUS_CENTER.clone().add(new Vector3(0, 0, 5))
  const t = plusHit(origin, new Vector3(0, 0, -1), plusTurn(0))
  expect(t).toBeCloseTo(5 - PLUS_BAR, 5)
})

test('a ray between its arms misses it', () => {
  // Off both bars: past the upright's side and above the crossbar.
  const origin = PLUS_CENTER.clone().add(new Vector3(0.4, 0.4, 5))
  expect(plusHit(origin, new Vector3(0, 0, -1), plusTurn(0))).toBe(Infinity)
})

test('a quarter turn about its upright swings the crossbar round to face a ray from the side', () => {
  // From the side, off the middle: the unturned bars are both too thin to
  // reach it; turned a quarter about y, the crossbar spans the ray's path.
  const origin = PLUS_CENTER.clone().add(new Vector3(5, 0, 0.4))
  const direction = new Vector3(-1, 0, 0)
  const quarter = new Matrix3().setFromMatrix4(new Matrix4().makeRotationY(Math.PI / 2))
  expect(plusHit(origin, direction, plusTurn(0))).toBe(Infinity)
  expect(plusHit(origin, direction, quarter)).toBeCloseTo(5 - PLUS_BAR, 5)
})

test('its turn spins it about its upright and tumbles it a little', () => {
  const up = new Vector3(0, 1, 0)
  // Unturned, the upright points straight up; spun, it leans with the tumble.
  expect(up.clone().applyMatrix3(plusTurn(0)).y).toBeCloseTo(1, 6)
  expect(up.clone().applyMatrix3(plusTurn(2)).y).toBeLessThan(1)
})
