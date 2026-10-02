import type { Vector3 } from 'three'

import type { Finger } from './loop'

const DEG = Math.PI / 180

/** Shared between the hand and the cursor each frame. */
export type Grasp = {
  /** World position of the hollow the fingers close around, written by the hand. */
  point: Vector3
  /** 0 → 1 as the fingers close on the ball; eased by the cursor. */
  grip: number
  /** 0 → 1 as the ball approaches, opening the fingers a little in anticipation. */
  reach: number
  /** Where the marble is drawn this frame, written by the cursor. */
  marble: Vector3
  /** 0 → 1 as the held cursor glows, and where that light sits; drives the light shafts. */
  glow: number
  light: Vector3
}

/** Render layer for the light behind the fist; only the light-shaft mask draws it. */
export const GLOW_LAYER = 5
/** Render layer for see-through effects (the cursor's halo): drawn normally, but never block light. */
export const FX_LAYER = 6

/** The debug marble at the cursor's tip: about 1cm across against a ~21cm hand (2.1 world units). */
export const BALL_RADIUS = 0.055
/**
 * How far the cursor travels from the grip's depth, in world units: toward the
 * camera at the front end of the depth axis, away from it at the back. The
 * camera sits about 6 units in front of the hand.
 */
export const DEPTH_FRONT = 2.4
export const DEPTH_BACK = 1.2
/**
 * Tilt of the depth axis on screen, counter-clockwise from left→right. At 0°
 * the cursor comes forward on the left and goes back on the right; at 30° it
 * comes forward at the bottom left and goes back toward the top right.
 */
export const DEPTH_ANGLE = 30 * DEG
/** The ball has to come this close to the grip, in world units, for the hand to close. */
export const GRAB_RADIUS = 0.2
/**
 * Pointer bands either side of the grip along the depth axis, in NDC-x units.
 * The hand only closes inside the narrow one and only lets go outside the wide
 * one, so a release never snaps straight back into a grab.
 */
export const GRAB_BAND = 0.12
export const RELEASE_BAND = 0.2
/** Fingers start opening toward an approaching ball inside this distance. */
export const REACH_RADIUS = 0.8

/**
 * Knuckle curl around a held ball; the joint shares wrap the rest of the
 * finger. Loose enough that the marble still shows between thumb and fingers.
 * The thumb's held curl lives in `tuning.ts`.
 */
export const GRAB_CURL: Record<Finger, number> = {
  Index: 38 * DEG,
  Middle: 42 * DEG,
  Ring: 46 * DEG,
  Little: 50 * DEG,
}

export type ScreenPoint = { x: number; y: number }
export type DepthAxis = {
  /** Radians, see DEPTH_ANGLE. */
  angle: number
  /** Viewport width / height, so the angle is the one you see on screen. */
  aspect: number
}

/**
 * How far a pointer (NDC) sits from the grip's screen position along the
 * depth axis — negative toward the front end, positive toward the back — in
 * NDC-x units, so at 0° it is simply the horizontal offset.
 */
export function depthOffset(pointer: ScreenPoint, grip: ScreenPoint, { angle, aspect }: DepthAxis) {
  const along =
    (pointer.x - grip.x) * aspect * Math.cos(angle) + (pointer.y - grip.y) * Math.sin(angle)
  return along / aspect
}

const CORNERS: ScreenPoint[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
]

/**
 * Pointer → world depth. The front end of the axis sits in front of the hand
 * and the back end behind it, scaled so the screen corner furthest toward each
 * end reaches the full `front` / `back` distance, and bent so the grip's own
 * screen position lands exactly on the grip's depth — the cursor can always be
 * lined up with the hand.
 */
export function depthAt(
  pointer: ScreenPoint,
  grip: ScreenPoint & { z: number },
  axis: DepthAxis = { angle: 0, aspect: 1 },
  front = DEPTH_FRONT,
  back = DEPTH_BACK,
): number {
  let nearest = -0.05
  let furthest = 0.05
  for (const corner of CORNERS) {
    const offset = depthOffset(corner, grip, axis)
    nearest = Math.min(nearest, offset)
    furthest = Math.max(furthest, offset)
  }
  const offset = depthOffset(pointer, grip, axis)
  if (offset <= 0) return grip.z + (front * offset) / nearest
  return grip.z - (back * offset) / furthest
}

/**
 * Held stays held while the pointer is anywhere inside the release band —
 * moving across the depth axis included — and lets go once it is pulled out
 * along it: toward the front end (out the front of the hand) or the back.
 * `offset` is `depthOffset` of the pointer.
 */
export function nextHeld(
  held: boolean,
  { distance, offset, active }: { distance: number; offset: number; active: boolean },
): boolean {
  if (held) return !active || Math.abs(offset) <= RELEASE_BAND
  return active && distance < GRAB_RADIUS && Math.abs(offset) < GRAB_BAND
}

/** 1 when the ball is in the grip, easing to 0 by REACH_RADIUS. */
export function reachFor(distance: number): number {
  const t = Math.min(Math.max((REACH_RADIUS - distance) / (REACH_RADIUS - GRAB_RADIUS), 0), 1)
  return t * t * (3 - 2 * t)
}
