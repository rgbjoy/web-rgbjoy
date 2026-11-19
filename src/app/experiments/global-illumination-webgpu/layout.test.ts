import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { Matrix3 } from 'three'

import { PROBE_COUNT } from './probes'
import { FrameUniforms, ProbeUpdateUniforms, SceneUniforms, wgslConstants } from './layout'

const wgsl = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

test('the scene uniforms land where WGSL lays out Scene', () => {
  const scene = new SceneUniforms()
  scene.lightPosition.set(1, 2, 3)
  scene.shadowSoftness = 4
  scene.emissive.set(5, 6, 7)
  scene.ambient = 8
  scene.glowCenter.set(9, 10, 11)
  scene.torusCenter.set(21, 22, 23)
  // Column-major, as three.js keeps it: columns (1,2,3), (4,5,6), (7,8,9).
  scene.blockInverse = new Matrix3().set(1, 4, 7, 2, 5, 8, 3, 6, 9)
  scene.plusCenter.set(31, 32, 33)
  scene.plusInverse = new Matrix3().set(1, 4, 7, 2, 5, 8, 3, 6, 9)
  const d = scene.pack()

  expect(d.byteLength).toBe(SceneUniforms.SIZE)
  expect([...d.slice(0, 12)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0])
  expect([...d.slice(20, 23)]).toEqual([21, 22, 23])
  // A mat3x3f is three columns, each padded to 16 bytes.
  expect([...d.slice(24, 36)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0])
  // After the torus's turn, at byte 192: the plus's centre, then its turn.
  expect([...d.slice(48, 52)]).toEqual([31, 32, 33, 0])
  expect([...d.slice(52, 64)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0])
})

test('the frame uniforms land where WGSL lays out Frame', () => {
  const frame = new FrameUniforms()
  frame.cameraPosition.set(1, 2, 3)
  frame.tanHalfFov = 0.5
  frame.previousForward.set(7, 8, 9)
  frame.resolution.set(640, 480)
  frame.jitter.set(0.25, 0.75)
  frame.mode = 2
  frame.volumeSteps = 32
  frame.airWeight = 0.25
  frame.animating = true
  frame.plusPreviousTurn = new Matrix3().set(1, 4, 7, 2, 5, 8, 3, 6, 9)
  frame.plusPreviousCenter.set(4, 5, 6)
  frame.smoothHistory = true
  frame.probesReady = true
  frame.localRefresh = true
  const buffer = frame.pack()
  const f32 = new Float32Array(buffer)
  const u32 = new Uint32Array(buffer)

  expect(buffer.byteLength).toBe(FrameUniforms.SIZE)
  expect([...f32.slice(0, 4)]).toEqual([1, 2, 3, 0.5])
  // previousUp ends at byte 108, where airWeight fills the gap; previousForward
  // is a vec3f, so it starts at 112, and animating fills the gap after it.
  expect(f32[27]).toBe(0.25)
  expect([...f32.slice(28, 31)]).toEqual([7, 8, 9])
  expect(u32[31]).toBe(1)
  expect([...f32.slice(32, 36)]).toEqual([640, 480, 0.25, 0.75])
  expect(u32[36]).toBe(2)
  expect(u32[41]).toBe(32)
  // volumeSteps ends at byte 168; the mat3x3f aligns to 16, so it starts at 176.
  expect([...f32.slice(44, 56)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0])
  expect([...f32.slice(56, 59)]).toEqual([4, 5, 6])
  // smoothHistory fills the gap after plusPreviousCenter; probesReady follows.
  expect(u32[59]).toBe(1)
  expect(u32[60]).toBe(1)
  expect(u32[61]).toBe(1)
})

test('the probe update packs its turn, its ray count and its weight', () => {
  const update = new ProbeUpdateUniforms()
  update.rotation = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  update.rays = 128
  update.weight = 0.25
  const buffer = update.pack()

  expect([...new Float32Array(buffer).slice(0, 12)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0])
  expect(new Uint32Array(buffer)[12]).toBe(128)
  expect(new Float32Array(buffer)[13]).toBe(0.25)
})

test('the structs declare their fields in the order they are packed', () => {
  const fields = (source: string, struct: string) => {
    const body = source.match(new RegExp(`struct ${struct} \\{([^}]*)\\}`))?.[1] ?? ''
    return [...body.matchAll(/^\s*(\w+):/gm)].map((match) => match[1])
  }
  expect(fields(wgsl('scene.wgsl'), 'Scene')).toEqual([
    'lightPosition', 'shadowSoftness', 'emissive', 'ambient', 'glowCenter', 'pebbleCenter',
    'blockCenter', 'torusCenter', 'blockInverse', 'torusInverse', 'plusCenter', 'plusInverse',
  ])
  expect(fields(wgsl('frame.wgsl'), 'Frame')).toEqual([
    'cameraPosition', 'tanHalfFov', 'cameraRight', 'weight', 'cameraUp', 'noiseIndex',
    'cameraForward', 'marchJitter', 'previousPosition', 'probeSettling', 'previousRight',
    'volumeDensity', 'previousUp', 'airWeight', 'previousForward', 'animating', 'resolution',
    'jitter', 'mode', 'sampling', 'marchSteps', 'method', 'bounces', 'volumeSteps',
    'plusPreviousTurn', 'plusPreviousCenter', 'smoothHistory', 'probesReady',
    'localRefresh',
  ])
  expect(fields(wgsl('probe.wgsl'), 'ProbeUpdate')).toEqual(['rotation', 'rays', 'weight'])
})

test('the WGSL constants carry the room and the probe grid', () => {
  const constants = wgslConstants()
  expect(constants).toContain('const ROOM_HALF = vec3f(3.5000, 2.2500, 6.0000);')
  expect(constants).toContain('const PROBE_GRID = vec3i(14, 9, 24);')
  expect(constants).toContain(`const PROBE_COUNT = ${PROBE_COUNT}u;`)
})
