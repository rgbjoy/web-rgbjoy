import { cssThemes } from "@thi.ng/color-palettes"

/** ~255 hand-mined palettes, each an array of hex strings. Our color pool. */
export const PALETTES: string[][] = [...cssThemes()].filter(
  (p) => p.length >= 3,
)

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Convert a "#rrggbb" hex to OKLab (L, a, b). Interpolating stops in OKLab is
 * what keeps blends vivid and natural instead of muddying through grey.
 */
export function hexToOklab(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16) / 255)
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16) / 255)
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16) / 255)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

/** Pick a random palette from the pool. */
export function randomPalette(): string[] {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)]
}
