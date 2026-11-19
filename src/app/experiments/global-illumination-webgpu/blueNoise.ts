/** Small, fast, seedable PRNG; enough to scatter the starting pattern. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Void-and-cluster (Ulichney 1993). Ranks every texel of a `size`×`size` torus
 * so that any threshold of the ranking is an evenly spread point set: the first
 * 10% are as far apart as 10% can be, and so on. That is what makes it blue —
 * no low frequencies, so one sample per pixel reads as fine grain, not blotches.
 *
 * Returns each texel's rank, 0 to size² − 1.
 */
export function voidAndCluster(size: number, seed: number, sigma = 1.5): Uint32Array {
  const count = size * size
  const random = mulberry32(seed)

  // A Gaussian splat, cut off where it no longer matters and kept narrower than
  // the torus so it never wraps onto itself.
  const reach = Math.min(Math.ceil(sigma * 4.5), (size - 1) >> 1)
  const splatX: number[] = []
  const splatY: number[] = []
  const splatWeight: number[] = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      splatX.push(dx)
      splatY.push(dy)
      splatWeight.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)))
    }
  }

  /** How crowded each texel is by the points currently set. */
  const energy = new Float64Array(count)
  const on = new Uint8Array(count)

  const set = (index: number, value: 0 | 1) => {
    on[index] = value
    const sign = value ? 1 : -1
    const x = index % size
    const y = (index - x) / size
    for (let k = 0; k < splatWeight.length; k++) {
      const sx = (x + splatX[k] + size) % size
      const sy = (y + splatY[k] + size) % size
      energy[sy * size + sx] += sign * splatWeight[k]
    }
  }

  const tightestCluster = () => {
    let best = -1
    let most = -Infinity
    for (let i = 0; i < count; i++) {
      if (on[i] && energy[i] > most) {
        most = energy[i]
        best = i
      }
    }
    return best
  }

  const largestVoid = () => {
    let best = -1
    let least = Infinity
    for (let i = 0; i < count; i++) {
      if (!on[i] && energy[i] < least) {
        least = energy[i]
        best = i
      }
    }
    return best
  }

  // A random tenth, then relaxed: keep moving the most crowded point into the
  // emptiest gap until the move would put it straight back.
  const seeded = Math.max(1, Math.round(count / 10))
  for (let placed = 0; placed < seeded; ) {
    const index = Math.floor(random() * count)
    if (on[index]) continue
    set(index, 1)
    placed++
  }
  for (let guard = 0; guard < count * 4; guard++) {
    const crowded = tightestCluster()
    set(crowded, 0)
    const gap = largestVoid()
    set(gap, 1)
    if (gap === crowded) break
  }

  const prototype = on.slice()
  const prototypeEnergy = energy.slice()
  const rank = new Uint32Array(count)

  // Below the prototype: peel off the most crowded point, latest rank first.
  for (let r = seeded - 1; r >= 0; r--) {
    const crowded = tightestCluster()
    set(crowded, 0)
    rank[crowded] = r
  }

  // Above it: fill the emptiest gap. Past half full, the tightest cluster of
  // the empty texels is the same texel as the largest void of the full ones
  // (the splats sum to a constant), so one rule runs all the way to the end.
  on.set(prototype)
  energy.set(prototypeEnergy)
  for (let r = seeded; r < count; r++) {
    const gap = largestVoid()
    set(gap, 1)
    rank[gap] = r
  }

  return rank
}

export const BLUE_NOISE_SIZE = 64

/**
 * Four independent blue-noise layers packed into RGBA, 8 bits each: two for a
 * bounce direction, then where the bounce march and the air march each start.
 */
export function blueNoiseRGBA(size = BLUE_NOISE_SIZE): Uint8Array {
  const count = size * size
  const data = new Uint8Array(count * 4)
  for (let channel = 0; channel < 4; channel++) {
    const rank = voidAndCluster(size, 0x9e3779b9 + channel * 7919)
    for (let i = 0; i < count; i++) {
      data[i * 4 + channel] = Math.floor((rank[i] * 256) / count)
    }
  }
  return data
}
