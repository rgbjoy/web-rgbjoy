import { expect, test } from 'bun:test'

import { BLOCK_FLOATS, compose, partition, settle, writeBlocks, type Cut } from './frames'
import { mutedPalette, oklch, random, vividPalette } from './palette'

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** OKLab lightness of an sRGB colour: what the palettes ramp, whatever the hue does. */
const lightness = (rgb: number[]) => {
  const [r, g, b] = rgb.map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

test('the same seed always makes the same frame', () => {
  expect(compose(1234, 16 / 9, 'Mixed')).toEqual(compose(1234, 16 / 9, 'Mixed'))
  expect(compose(1234, 16 / 9, 'Mixed')).not.toEqual(compose(1235, 16 / 9, 'Mixed'))
})

test('the partition tiles the grid exactly once, no block over the largest share', () => {
  for (let seed = 0; seed < 50; seed++) {
    const rng = random(seed)
    const columns = 2 + Math.floor(rng() * 10)
    const rows = 2 + Math.floor(rng() * 6)
    const largest = rng()
    const cells = partition(rng, columns, rows, rng(), 1.5, largest)

    const hits = new Array(columns * rows).fill(0)
    for (const cell of cells) {
      expect(cell.c1).toBeGreaterThan(cell.c0)
      expect(cell.r1).toBeGreaterThan(cell.r0)
      const area = (cell.c1 - cell.c0) * (cell.r1 - cell.r0)
      expect(area).toBeLessThanOrEqual(Math.max(1, largest * columns * rows))
      for (let c = cell.c0; c < cell.c1; c++) for (let r = cell.r0; r < cell.r1; r++) hits[r * columns + c]++
    }
    expect(hits.every((n) => n === 1)).toBe(true)
  }
})

test('every block is a real rectangle in screen colours', () => {
  for (let seed = 0; seed < 50; seed++) {
    for (const look of ['Fields', 'Tiles'] as const) {
      const { blocks } = compose(seed, seed % 2 ? 16 / 9 : 9 / 19, look)
      expect(blocks.length).toBeGreaterThan(1)
      for (const block of blocks) {
        const [l, b, r, t] = block.rect
        expect(r).toBeGreaterThan(l)
        expect(t).toBeGreaterThan(b)
        for (const c of [...block.color, ...block.color2]) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
        expect(block.delay).toBeLessThanOrEqual(0.7 + 1e-9)
      }
    }
  }
})

test('palettes run dark to light', () => {
  for (let seed = 0; seed < 50; seed++) {
    for (const palette of [vividPalette(random(seed)), mutedPalette(random(seed))]) {
      const lights = palette.map(lightness)
      lights.slice(1).forEach((light, i) => expect(light).toBeGreaterThan(lights[i]))
    }
  }
})

test('oklch lands on sRGB and clips chroma rather than lightness', () => {
  const red = oklch(0.627955, 0.257683, 29.2339)
  expect(red[0]).toBeCloseTo(1, 3)
  expect(red[1]).toBeCloseTo(0, 3)
  expect(red[2]).toBeCloseTo(0, 3)

  const [r, g, b] = oklch(0.5, 0.5, 250)
  for (const c of [r, g, b]) {
    expect(c).toBeGreaterThanOrEqual(0)
    expect(c).toBeLessThanOrEqual(1)
  }
})

const frame = (seed: number) => compose(seed, 16 / 9, 'Tiles')

test('a cut comes in over its length, block by block', () => {
  const cut: Cut = { frame: frame(7), start: 10 }
  const out = new Float32Array(512 * BLOCK_FLOATS)

  expect(writeBlocks(out, [cut], 9.9, 2, 1)).toBe(0)
  const partway = writeBlocks(out, [cut], 11, 2, 1)
  expect(partway).toBeGreaterThan(0)
  expect(partway).toBeLessThanOrEqual(cut.frame.blocks.length)

  const all = writeBlocks(out, [cut], 12, 2, 1)
  expect(all).toBe(cut.frame.blocks.length)
  cut.frame.blocks.forEach((block, i) => {
    expect(out[i * BLOCK_FLOATS + 11]).toBeCloseTo(block.alpha, 6)
  })
})

test('when the blocks overflow, the oldest cut goes first', () => {
  const old: Cut = { frame: frame(1), start: 0 }
  const fresh: Cut = { frame: frame(2), start: 5 }
  const room = fresh.frame.blocks.length + 1
  const out = new Float32Array(room * BLOCK_FLOATS)

  expect(writeBlocks(out, [old, fresh], 100, 1, 0)).toBe(fresh.frame.blocks.length)
  expect(Array.from(out.subarray(8, 11))).toEqual(fresh.frame.blocks[0].color.map(Math.fround))
})

test('a cut that has fully landed buries the ones before it', () => {
  const cuts: Cut[] = [
    { frame: frame(1), start: 0 },
    { frame: frame(2), start: 5 },
    { frame: frame(3), start: 6 },
  ]
  expect(settle(cuts, 6, 2)).toHaveLength(3)
  expect(settle(cuts, 7, 2).map((c) => c.start)).toEqual([5, 6])
  expect(settle(cuts, 8, 2).map((c) => c.start)).toEqual([6])
})
