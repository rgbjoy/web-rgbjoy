/** Fixed world-space height band; independent of mesh resolution/elevation. */
export const SHORE_BLEND_HEIGHT = 1.8

/**
 * Compress the profile toward sea level, fading smoothly back to the original
 * terrain outside the coastal band. This strictly increasing curve preserves
 * which side of the waterline each point lies on, without flattening peaks.
 */
export function softenShoreHeight(
  height: number,
  waterLevel: number,
  softness: number,
) {
  const amount = Math.max(0, Math.min(1, softness))
  const distance = height - waterLevel
  const t = Math.abs(distance) / SHORE_BLEND_HEIGHT
  if (amount === 0 || t >= 1) return height

  // 1 - smoothstep(t): zero influence and zero derivative at the outer join.
  const influence = (1 - t) * (1 - t) * (1 + 2 * t)
  // Retain a nonzero slope even at 100%, avoiding a perfectly flat waterline.
  return waterLevel + distance * (1 - 0.85 * amount * influence)
}
