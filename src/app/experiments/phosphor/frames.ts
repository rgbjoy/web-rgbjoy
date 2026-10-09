import { lerp, mutedPalette, random, vividPalette, type Random, type Rgb } from "./palette"

/**
 * Frames in the manner of a video starved of bitrate: a coarse grid of flat
 * tiles merged into bigger blocks, copies of some of them dragged a little way
 * off by the motion vectors, edges crisp in one place and smeared in the next,
 * gradients that fall in steps.
 */

export const LOOKS = ["Mixed", "Fields", "Tiles"] as const
export type Look = (typeof LOOKS)[number]
type Style = Exclude<Look, "Mixed">

export type Block = {
  /** Left, bottom, right, top, as fractions of the screen. */
  rect: [number, number, number, number]
  /** How far each edge feathers, in the same order, in screen heights. */
  soft: [number, number, number, number]
  color: Rgb
  /** What the block grades into along `axis`; the same as `color` when flat. */
  color2: Rgb
  /** 0 flat, 1 left to right, 2 bottom to top. */
  axis: number
  alpha: number
  /** Stair steps in the feathers and the gradient; 0 is smooth. */
  steps: number
  /** Which way and how far it wanders while the frame holds, as a fraction of the screen. */
  drift: [number, number]
  /** Radians a second. */
  speed: number
  phase: number
  /** When it comes in during a cut, as a fraction of the cut. */
  delay: number
  /** Where it slides in from, as a fraction of the screen. */
  enter: [number, number]
}

export type Frame = { seed: number; style: Style; blocks: Block[] }

type Range = [number, number]

type StyleSpec = {
  vivid: boolean
  rows: Range
  /** Columns for each row, relative to the screen's aspect. */
  columns: Range
  /** How far the grid gets cut up: 0 leaves a few big fields, 1 nearly every cell. */
  detail: Range
  /** The most of the grid one block may keep. */
  largest: number
  /** The usual feather, in screen heights. */
  soft: Range
  /** Odds an edge is crisp, and that it smears a long way instead. */
  crisp: number
  streak: number
  /** Odds a block falls in stair steps. */
  steps: number
  /** Share of tiles with a displaced copy, and how far the copies move, in cells. */
  ghosts: Range
  shift: Range
}

const STYLES: Record<Style, StyleSpec> = {
  // The first reference: a handful of big saturated fields, soft and smeared.
  Fields: {
    vivid: true,
    rows: [3, 5],
    columns: [0.7, 1],
    detail: [0.1, 0.35],
    largest: 0.3,
    soft: [0.05, 0.15],
    crisp: 0.15,
    streak: 0.3,
    steps: 0.45,
    ghosts: [0.4, 0.8],
    shift: [0.15, 0.5],
  },
  // The second: many tiles in one muted hue, mostly crisp, a few ghosted.
  Tiles: {
    vivid: false,
    rows: [4, 6],
    columns: [0.5, 0.7],
    detail: [0.45, 0.75],
    largest: 0.1,
    soft: [0.003, 0.012],
    crisp: 0.6,
    streak: 0.06,
    steps: 0.2,
    ghosts: [0.15, 0.4],
    shift: [0.06, 0.3],
  },
}

/** The share of a cut each block takes to fade all the way in. */
export const REVEAL = 0.3

/** Floats a block takes in the data texture: five RGBA texels. */
export const BLOCK_FLOATS = 20

const between = (rng: Random, [a, b]: Range) => lerp(a, b, rng())
const pick = <T>(rng: Random, items: readonly T[]) => items[Math.floor(rng() * items.length)]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export type Cell = { c0: number; r0: number; c1: number; r1: number }

/**
 * Cuts the grid in two again and again along its lines, mostly across its
 * longer side on screen, stopping sooner the lower the detail, but never
 * while a block holds more than `largest` of the grid.
 */
export function partition(
  rng: Random,
  columns: number,
  rows: number,
  detail: number,
  cellAspect: number,
  largest = 1,
): Cell[] {
  const cells: Cell[] = []
  const split = (cell: Cell, depth: number) => {
    const w = cell.c1 - cell.c0
    const h = cell.r1 - cell.r0
    const small = w * h <= largest * columns * rows
    const stop = depth > 0 && small && rng() < (1 - detail) * (0.15 + 0.2 * depth)
    if ((w === 1 && h === 1) || stop) {
      cells.push(cell)
      return
    }
    const wide = w * cellAspect > h
    const across = w > 1 && (h === 1 || rng() < (wide ? 0.8 : 0.2))
    if (across) {
      const at = cell.c0 + 1 + Math.floor(rng() * (w - 1))
      split({ ...cell, c1: at }, depth + 1)
      split({ ...cell, c0: at }, depth + 1)
    } else {
      const at = cell.r0 + 1 + Math.floor(rng() * (h - 1))
      split({ ...cell, r1: at }, depth + 1)
      split({ ...cell, r0: at }, depth + 1)
    }
  }
  split({ c0: 0, r0: 0, c1: columns, r1: rows }, 0)
  return cells
}

/**
 * Where the frame is light and where it is dark: mostly lighter toward the
 * top, as in both references, plus a pool or two of light or shade.
 */
function lightField(rng: Random, aspect: number) {
  const angle = rng() < 0.7 ? Math.PI / 2 + (rng() - 0.5) * 1.6 : rng() * Math.PI * 2
  const tilt = 0.6 + rng() * 0.8
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const pools = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => ({
    x: rng() * aspect,
    y: rng(),
    r: 0.2 + rng() * 0.4,
    w: (rng() < 0.6 ? 1 : -1) * (0.5 + rng()),
  }))
  return (x: number, y: number) => {
    const px = x * aspect
    let value = tilt * ((px - aspect / 2) * dx + (y - 0.5) * dy)
    for (const pool of pools) {
      value += pool.w * Math.exp(-((px - pool.x) ** 2 + (y - pool.y) ** 2) / (pool.r * pool.r))
    }
    return value
  }
}

function feather(rng: Random, spec: StyleSpec) {
  const roll = rng()
  if (roll < spec.crisp) return 0.002 + rng() * 0.003
  if (roll < spec.crisp + spec.streak) return 0.1 + rng() * 0.15
  return between(rng, spec.soft)
}

const feathers = (rng: Random, spec: StyleSpec): Block["soft"] => [
  feather(rng, spec),
  feather(rng, spec),
  feather(rng, spec),
  feather(rng, spec),
]

const stepsFor = (rng: Random, spec: StyleSpec) =>
  rng() < spec.steps ? 3 + Math.floor(rng() * 4) : 0

export function compose(seed: number, aspect: number, look: Look): Frame {
  const rng = random(seed)
  const style: Style = look === "Mixed" ? pick(rng, ["Fields", "Tiles"] as const) : look
  const spec = STYLES[style]
  // Some mixed frames swap palettes: vivid tiles, muted fields.
  const vivid = look === "Mixed" && rng() < 0.2 ? !spec.vivid : spec.vivid
  const palette = vivid ? vividPalette(rng) : mutedPalette(rng)
  const top = palette.length - 1

  const rows = Math.round(between(rng, spec.rows))
  const columns = Math.max(2, Math.round(rows * aspect * between(rng, spec.columns)))
  const cells = partition(
    rng,
    columns,
    rows,
    between(rng, spec.detail),
    (rows * aspect) / columns,
    spec.largest,
  )

  // Rank the cells by the light field so every colour in the palette gets used.
  const field = lightField(rng, aspect)
  const light = cells.map((c) => field((c.c0 + c.c1) / (2 * columns), (c.r0 + c.r1) / (2 * rows)))
  const order = light.map((_, i) => i).sort((a, b) => light[a] - light[b])
  const rank = new Array<number>(cells.length)
  order.forEach((cell, i) => (rank[cell] = cells.length > 1 ? i / (cells.length - 1) : 0.5))

  // The motion vectors: the frame mostly drifts one way, each block a little its own way.
  const flow = rng() * Math.PI * 2
  const sweep = rng() * Math.PI * 2
  const slide = 0.02 + rng() * 0.04
  const enter = (): Block["enter"] => [
    -Math.cos(flow) * slide + (rng() - 0.5) * 0.01,
    -Math.sin(flow) * slide + (rng() - 0.5) * 0.01,
  ]
  // Cuts come in as a ragged wipe across the screen.
  const wipe = (x: number, y: number) => {
    const along = (Math.cos(sweep) * (x - 0.5) * aspect + Math.sin(sweep) * (y - 0.5)) /
      (Math.abs(Math.cos(sweep)) * aspect + Math.abs(Math.sin(sweep)))
    return (1 - REVEAL) * clamp01(0.75 * (along + 0.5) + 0.25 * rng())
  }

  const tiles: Block[] = []
  const ghosts: Block[] = []
  const ghostShare = between(rng, spec.ghosts)

  cells.forEach((cell, i) => {
    const index = Math.round(clamp01(rank[i] + (rng() - 0.5) * 0.35) * top)
    const color = palette[index]
    const soft = feathers(rng, spec)
    const x0 = cell.c0 / columns
    const y0 = cell.r0 / rows
    const x1 = cell.c1 / columns
    const y1 = cell.r1 / rows
    const graded = rng() < 0.25
    const across = (x1 - x0) * aspect > y1 - y0
    const delay = wipe((x0 + x1) / 2, (y0 + y1) / 2)
    tiles.push({
      // Each tile reaches half its feather under its neighbours, so a seam
      // blends tile into tile and never lets the background through.
      rect: [x0 - soft[0] / 2 / aspect, y0 - soft[1] / 2, x1 + soft[2] / 2 / aspect, y1 + soft[3] / 2],
      soft,
      color,
      color2: graded ? palette[Math.min(top, Math.max(0, index + pick(rng, [-1, 1])))] : color,
      axis: graded ? (across ? 1 : 2) : 0,
      alpha: 1,
      steps: stepsFor(rng, spec),
      drift: [0, 0],
      speed: 0,
      phase: 0,
      delay,
      enter: enter(),
    })

    if (rng() >= ghostShare) return

    // A copy of the tile, dragged along the flow, in a neighbouring colour.
    const reach = between(rng, spec.shift)
    const angle = flow + (rng() - 0.5) * 1.2
    const dx = (Math.cos(angle) * reach) / columns
    const dy = (Math.sin(angle) * reach) / rows
    let rect: Block["rect"] = [x0 + dx, y0 + dy, x1 + dx, y1 + dy]
    // Sometimes only a band of it, along one edge.
    if (rng() < 0.3) {
      const band = lerp(0.15, 0.4, rng())
      const [l, b, r, t] = rect
      if (rng() < 0.5) {
        const h = (t - b) * band
        rect = rng() < 0.5 ? [l, b, r, b + h] : [l, t - h, r, t]
      } else {
        const w = (r - l) * band
        rect = rng() < 0.5 ? [l, b, l + w, t] : [r - w, b, r, t]
      }
    }
    const shade = Math.min(top, Math.max(0, index + pick(rng, [-2, -1, 1, 1, 2])))
    const wander = 0.002 + rng() * 0.006
    ghosts.push({
      rect,
      soft: feathers(rng, spec),
      color: palette[shade],
      color2: palette[shade],
      axis: 0,
      alpha: 0.45 + rng() * 0.45,
      steps: stepsFor(rng, spec),
      drift: [Math.cos(angle) * wander, Math.sin(angle) * wander],
      speed: 0.2 + rng() * 0.3,
      phase: rng() * Math.PI * 2,
      delay: Math.min(1 - REVEAL, delay + 0.05 + rng() * 0.1),
      enter: enter(),
    })
  })

  return { seed, style, blocks: [...tiles, ...ghosts] }
}

/** A frame on screen and when it cut in, in seconds. */
export type Cut = { frame: Frame; start: number }

/**
 * Writes every block on screen at `time` into `out`, five RGBA texels each,
 * and returns how many. Cuts paint in order, so the latest lands on top; if
 * they don't all fit, the oldest go first.
 */
export function writeBlocks(
  out: Float32Array,
  cuts: readonly Cut[],
  time: number,
  cutLength: number,
  drift: number,
): number {
  const capacity = Math.floor(out.length / BLOCK_FLOATS)
  let first = cuts.length - 1
  let needed = cuts[first]?.frame.blocks.length ?? 0
  while (first > 0 && needed + cuts[first - 1].frame.blocks.length <= capacity) {
    needed += cuts[--first].frame.blocks.length
  }

  let count = 0
  for (const cut of cuts.slice(Math.max(0, first))) {
    const progress = cutLength > 0 ? (time - cut.start) / cutLength : Infinity
    for (const block of cut.frame.blocks) {
      if (count === capacity) return count
      const reveal = clamp01((progress - block.delay) / REVEAL)
      if (reveal <= 0) continue
      const eased = 1 - (1 - reveal) ** 3
      const wave = Math.sin(time * block.speed + block.phase) * drift
      const dx = block.enter[0] * (1 - eased) + block.drift[0] * wave
      const dy = block.enter[1] * (1 - eased) + block.drift[1] * wave

      const o = count * BLOCK_FLOATS
      const [l, b, r, t] = block.rect
      out.set([l + dx, b + dy, r + dx, t + dy], o)
      out.set(block.soft, o + 4)
      out.set(block.color, o + 8)
      out[o + 11] = block.alpha * reveal
      out.set(block.color2, o + 12)
      out[o + 15] = block.axis
      out[o + 16] = block.steps
      count++
    }
  }
  return count
}

/** Drops the cuts buried under a later one that has finished coming in. */
export function settle(cuts: readonly Cut[], time: number, cutLength: number): Cut[] {
  for (let i = cuts.length - 1; i > 0; i--) {
    if (time - cuts[i].start >= cutLength) return cuts.slice(i)
  }
  return [...cuts]
}
