import { DEPTH_ANGLE, DEPTH_BACK, DEPTH_FRONT } from './grasp'
import { THUMB_REST } from './loop'

/**
 * Live-tunable values, edited by the panel at `/experiments/hand?debug`.
 * The defaults are the shipped look; once something feels right, copy the
 * numbers ("Copy values" in the panel) back into these defaults.
 */
export const tuning = {
  /** Nudge of the grasp point in screen space, world units: x right, y up, z toward you. */
  graspX: -0.2,
  graspY: 0.25,
  graspZ: 0,
  /**
   * How far a held cursor (and its glow) sinks away from the camera from the
   * catch point, so it sits inside the fist behind the thumb and fingers.
   */
  holdDepth: 0.25,
  /**
   * Radius of the light behind the hand that throws the shafts. Larger than
   * the fist and its edges peek around the thumb and fingers, like a hand
   * held up to the sun.
   */
  shaftSource: 0.3,
  /** Brightness of the light shafts. */
  shaftStrength: 3.5,
  /** How far the cursor comes toward the camera at the left edge, and goes back at the right. */
  depthFront: DEPTH_FRONT,
  depthBack: DEPTH_BACK,
  /** Tilt of the depth axis on screen, in degrees: 0 is left→right, 30 runs bottom-left→top-right. */
  depthAngle: Math.round((DEPTH_ANGLE * 180) / Math.PI),
  /** Extra knuckle curl on every finger in the idle loop, in degrees. */
  fingerIdle: 0,
  /** Extra knuckle curl on every finger while holding, in degrees. */
  fingerGrab: -6,
  /** The thumb's resting curl in the idle loop, which the ripple sways around, in degrees. */
  thumbIdle: THUMB_REST,
  /** Thumb curl while holding, in degrees. */
  thumbGrab: 18,
  /**
   * How the thumb's last joint hinges relative to the joints below it, as a
   * multiple of the thumb curl. Negative folds it back the other way.
   */
  thumbTip: -1.15,
  /** Draw the grasp point and its catch radius over the hand. */
  showZone: false,
  /** Draw the marble's depth path at the pointer's height, and its recent trail. */
  showPath: false,
  /** Show the marble the grab logic tracks at the arrow's tip. */
  showMarble: false,
  /** Draw the depth path as a rod that thins with distance, so depth reads from the main camera. */
  showDepth: false,
}

/** Written every frame so the panel can show where things are, in NDC (-1…1, y up). */
export const readout = {
  pointerX: 0,
  pointerY: 0,
  graspScreenX: 0,
  graspScreenY: 0,
  /** Cursor depth relative to the grip, world units; positive is toward the camera. */
  depth: 0,
  distance: 0,
  held: false,
}
