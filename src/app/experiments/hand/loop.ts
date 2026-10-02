/** One full ripple of the fingers. Every value below is periodic in it, so the loop is seamless. */
export const LOOP_SECONDS = 8

export const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const
export type Finger = (typeof FINGERS)[number]

/** Each joint takes a share of the knuckle's curl; the middle joint folds most, like a real hand. */
export const FINGER_SEGMENTS = [
  ['Proximal', 1],
  ['Intermediate', 1.1],
  ['Distal', 0.7],
] as const

const DEG = Math.PI / 180
const TAU = Math.PI * 2

/**
 * Resting knuckle curl, a touch more open than the Blender look-dev pose so
 * the wave has room. The joint shares multiply this by ~2.8 along the finger,
 * so the swing stays small or the hand closes into a fist.
 */
const REST_CURL: Record<Finger, number> = { Index: 10, Middle: 16, Ring: 23, Little: 30 }
const CURL_SWING = 14
/** The thumb's resting curl and how far it sways with the ripple, in degrees. */
export const THUMB_REST = 8
const THUMB_SWING = 7
/** The little finger leads and the index follows, so the curl rolls across the hand. */
const LAG: Record<Finger, number> = { Little: 0, Ring: 0.08, Middle: 0.16, Index: 0.24 }

export type HandPose = {
  /** Knuckle curl per finger, in radians. */
  curl: Record<Finger, number>
  thumb: number
  /** Small wrist roll and lift so the hand breathes rather than hangs. */
  sway: number
  lift: number
  /** Key light azimuth offset, so the highlight crawls over the knuckles. */
  light: number
}

/** 0 → 1 → 0 once per loop. Raised to a power so fingers dwell open and close briefly. */
const wave = (phase: number) => Math.pow(0.5 - 0.5 * Math.cos(TAU * phase), 1.6)

export function sampleLoop(seconds: number, pose?: HandPose): HandPose {
  const phase = (((seconds / LOOP_SECONDS) % 1) + 1) % 1
  const out = pose ?? {
    curl: { Index: 0, Middle: 0, Ring: 0, Little: 0 },
    thumb: 0,
    sway: 0,
    lift: 0,
    light: 0,
  }
  for (const finger of FINGERS)
    out.curl[finger] = (REST_CURL[finger] + CURL_SWING * wave(phase - LAG[finger])) * DEG
  out.thumb = (THUMB_REST + THUMB_SWING * wave(phase - 0.3)) * DEG
  out.sway = Math.sin(TAU * phase) * 2.5 * DEG
  out.lift = Math.sin(TAU * phase + 0.6) * 0.04
  out.light = Math.sin(TAU * phase - 0.4) * 0.22
  return out
}
