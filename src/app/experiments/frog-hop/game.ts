import { Color, MathUtils, Vector3 } from "three"

import { type PadDefinition } from "./course"

export type GamePhase =
  | "idle"
  | "aiming"
  | "shooting"
  | "landed"
  | "missed"
  | "resetting"

export type Shot = {
  direction: Vector3
  power: number
  start: Vector3
  launchEnd: Vector3
  wind: Vector3
  end: Vector3
  duration: number
  arcHeight: number
  elapsed: number
}

export type HudState = {
  /** Not displayed — it's visible on screen. Kept as the update trigger. */
  phase: GamePhase
  streak: number
  bestStreak: number
  /** Furthest main-course lily reached; dock tutorial is level 0. */
  level: number
  targetId?: string
  windAngle: number
  windSpeed: number
  hint?: string
}

export type Wind = {
  angle: number
  strength: number
  speed: number
}

export const DRAG_DEAD_ZONE = 12
export const MAX_DRAG_DISTANCE = 150

/**
 * Wind tuning. `strength` is world units of lateral drift at a reference-length
 * hop and average power; `windOffset` scales it by power and hop length.
 * Landing radii are roughly 0.85–1.2, so drift of ~0.6–1.2 means wind is the
 * main thing you are playing against.
 */
export const WIND_MAX_ANGLE = 78
export const WIND_MIN_SPEED = 4
export const WIND_SPEED_SPREAD = 8
export const WIND_BASE_STRENGTH = 0.28
export const WIND_STRENGTH_PER_SPEED = 0.145
export const WIND_REFERENCE_RANGE = 4.4
/** >1 makes drift build later in the arc, so the hop visibly bends. */
export const WIND_DRIFT_EXPONENT = 1.7

const green = new Color("#69e36f")
const orange = new Color("#ffb13b")
const red = new Color("#ff554d")

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function powerFromDrag(distance: number) {
  return clamp01(
    (distance - DRAG_DEAD_ZONE) / (MAX_DRAG_DISTANCE - DRAG_DEAD_ZONE),
  )
}

/**
 * Absolute hop range in world units. This is deliberately NOT relative to the
 * current target: scaling by target distance capped a full-power hop at exactly
 * the target's centre, so overshooting was impossible and the top of the power
 * bar felt dead. Course hops span 3.25–5.25, which sits at roughly 36%–74% of
 * this range, leaving real headroom to over- and under-hit.
 */
export const MIN_HOP_DISTANCE = 1.4
export const MAX_HOP_DISTANCE = 6.6

export function jumpDistance(power: number) {
  return MathUtils.lerp(MIN_HOP_DISTANCE, MAX_HOP_DISTANCE, clamp01(power))
}

/**
 * djb2 plus a murmur3 finalizer. A plain djb2 leaves the low bits barely mixed,
 * which made neighbouring pad ids land on near-identical wind angles — the whole
 * pond blew the same way. Every step is forced back to unsigned: `^` yields a
 * signed int, and one negative hash makes the angle fall outside ±WIND_MAX_ANGLE.
 */
function hashPadId(id: string) {
  let hash = 5381
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 33) + id.charCodeAt(index)) >>> 0
  }

  hash = (hash ^ (hash >>> 15)) >>> 0
  hash = Math.imul(hash, 2246822507) >>> 0
  hash = (hash ^ (hash >>> 13)) >>> 0
  hash = Math.imul(hash, 3266489909) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}

/**
 * Wind is a deterministic hash of the target pad's id, so a course always plays
 * the same winds in the same places. A pad's `windScale` dials it down (or off)
 * for the tutorial hops.
 */
export function windForPad(pad?: PadDefinition): Wind {
  const scale = pad?.windScale ?? 1

  if (!pad || scale <= 0) return { angle: 0, strength: 0, speed: 0 }

  const hash = hashPadId(pad.id)
  const angle = (hash % (WIND_MAX_ANGLE * 2 + 1)) - WIND_MAX_ANGLE
  const speed = Math.max(
    1,
    Math.round(
      (WIND_MIN_SPEED + ((hash >>> 9) % WIND_SPEED_SPREAD)) * scale,
    ),
  )

  return {
    angle,
    speed,
    strength: WIND_BASE_STRENGTH + speed * WIND_STRENGTH_PER_SPEED,
  }
}

/** How far, and which way, the wind pushes a hop of this power and length. */
export function windOffset(
  direction: Vector3,
  strength: number,
  power: number,
  range: number,
  target = new Vector3(),
) {
  const powerFactor = MathUtils.lerp(0.6, 1.25, power)
  const rangeFactor = 0.6 + 0.4 * clamp01(range / WIND_REFERENCE_RANGE)
  return target
    .copy(direction)
    .multiplyScalar(strength * powerFactor * rangeFactor)
}

/**
 * Length to launch along `direction` so that, once `offset` is added, the total
 * displacement still measures `desiredRange`. Wind rotates where you end up
 * without lengthening or shortening the hop.
 */
export function solveLaunchDistance(
  direction: Vector3,
  offset: Vector3,
  desiredRange: number,
) {
  const along = direction.dot(offset)
  return Math.max(
    0.2,
    -along +
      Math.sqrt(
        Math.max(
          0,
          along * along + desiredRange * desiredRange - offset.lengthSq(),
        ),
      ),
  )
}

export function powerColor(power: number, target = new Color()) {
  if (power < 0.55) {
    return target.lerpColors(green, orange, power / 0.55)
  }

  return target.lerpColors(orange, red, (power - 0.55) / 0.45)
}

export function pointOnShot(shot: Shot, progress: number, target = new Vector3()) {
  const t = clamp01(progress)
  target.lerpVectors(shot.start, shot.launchEnd, t)
  target.addScaledVector(shot.wind, Math.pow(t, WIND_DRIFT_EXPONENT))
  target.y += Math.sin(Math.PI * t) * shot.arcHeight
  return target
}

/**
 * Horizontal velocity along the shot at `progress` — the analytic derivative of
 * `pointOnShot`, minus the arc's vertical term. Unnormalised.
 *
 * The constant part is the launch vector; the wind term grows as
 * `n * t^(n-1)`, which is why a hop starts out pointing where you aimed and
 * ends up pointing where the wind actually took it.
 */
export function velocityOnShot(
  shot: Shot,
  progress: number,
  target = new Vector3(),
) {
  const t = clamp01(progress)
  target.subVectors(shot.launchEnd, shot.start)
  target.addScaledVector(
    shot.wind,
    WIND_DRIFT_EXPONENT * Math.pow(t, WIND_DRIFT_EXPONENT - 1),
  )
  target.y = 0
  return target
}

/** Vertical rate of the arc at `progress`, normalised to roughly −1…1. */
export function climbRateOnShot(progress: number) {
  return Math.cos(Math.PI * clamp01(progress))
}

export function findLandingPad(
  point: Vector3,
  pads: PadDefinition[],
): PadDefinition | undefined {
  let closest: PadDefinition | undefined
  let closestDistance = Number.POSITIVE_INFINITY

  for (const pad of pads) {
    const dx = point.x - pad.position[0]
    const dz = point.z - pad.position[2]
    const distance = Math.hypot(dx, dz)
    // The frog's *centre* is tested, so anywhere over the pad's disc counts.
    // The caller preserves the actual touchdown point after this test. Insetting
    // this (it used to be radius - 0.22) meant a hop that visibly put the frog
    // half onto a pad still splashed.
    // Generated pads are always separated by at least r1 + r2 + 0.35, so
    // full-radius landing zones still can't overlap.
    const landingRadius = Math.max(0.35, pad.radius)

    if (distance <= landingRadius && distance < closestDistance) {
      closest = pad
      closestDistance = distance
    }
  }

  return closest
}
