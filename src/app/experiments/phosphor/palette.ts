/** sRGB, gamma-encoded, 0–1 a channel. */
export type Rgb = [number, number, number]

/** A seeded stream of numbers in [0, 1): the same seed always makes the same frame. */
export type Random = () => number

export function random(seed: number): Random {
  // mulberry32
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function oklabToLinear(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const encode = (c: number) => {
  const x = Math.min(1, Math.max(0, c))
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/**
 * OKLCH to sRGB. Colours the screen can't show give up chroma, never
 * lightness or hue, until they fit.
 */
export function oklch(L: number, C: number, hue: number): Rgb {
  const angle = (hue * Math.PI) / 180
  const at = (chroma: number) =>
    oklabToLinear(L, chroma * Math.cos(angle), chroma * Math.sin(angle))
  let rgb = at(C)
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(at(mid))) lo = mid
      else hi = mid
    }
    rgb = at(lo)
  }
  return rgb.map(encode) as Rgb
}

/**
 * Mostly the references' side of the wheel, from blue through violet and
 * magenta to red; now and then anywhere at all.
 */
const startingHue = (rng: Random) => (rng() < 0.6 ? 250 + rng() * 140 : rng() * 360)

/**
 * Where a vivid palette's darkest colour sits: anywhere from cyan round to
 * red, where deep colours stay rich. Dark yellows only ever go olive and brown.
 */
const darkHue = (rng: Random) => (rng() < 0.6 ? 250 + rng() * 80 : 160 + rng() * 240)

/**
 * A few saturated colours turning through a wide arc of hue as they lighten,
 * like the first reference: navy, violet, magenta, coral. Dark to light.
 */
export function vividPalette(rng: Random): Rgb[] {
  const count = 4 + Math.floor(rng() * 2)
  const hue = darkHue(rng)
  const turn = (60 + rng() * 60) * (rng() < 0.5 ? -1 : 1)
  const dark = 0.26 + rng() * 0.08
  const light = 0.6 + rng() * 0.1
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    return oklch(lerp(dark, light, t ** 0.7), lerp(0.14, 0.25, Math.min(1, t * 1.6)), hue + turn * t)
  })
}

/**
 * One hue held narrow from charcoal to near-white, like the second
 * reference: grey in the shadows, richest about three-quarters of the way up,
 * paling again into the highlights. Dark to light.
 */
export function mutedPalette(rng: Random): Rgb[] {
  const count = 6 + Math.floor(rng() * 3)
  const hue = startingHue(rng)
  const turn = (8 + rng() * 16) * (rng() < 0.5 ? -1 : 1)
  const peak = 0.11 + rng() * 0.06
  const peakL = 0.74 + rng() * 0.04
  const dark = 0.32 + rng() * 0.08
  const light = 0.86 + rng() * 0.07
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    const L = lerp(dark, light, t)
    const chroma =
      L < peakL
        ? peak * smooth((L - 0.38) / (peakL - 0.38))
        : peak * (1 - (0.65 * (L - peakL)) / (0.94 - peakL))
    return oklch(L, chroma, hue + turn * t)
  })
}
