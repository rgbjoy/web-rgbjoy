import * as THREE from "three"
import type { Mesh, Texture } from "three"

/** A flyer stapled to the pole, in cylinder-local terms. */
export type PoleDecal = {
  id: number
  texture: Texture
  /** Angle around the pole's Y axis, in radians. */
  angle: number
  /** Height up the pole, measured from its base. */
  height: number
  /** Slight tilt, so nothing reads as machine-placed. */
  tilt: number
}

/** Viewport coordinates of a drop or a click, used to aim the raycast. */
export type DropPoint = {
  x: number
  y: number
}

export const CAMERA = {
  /** Lowest the camera drops, so it never sinks past the pole's base. */
  SCROLL_MIN_Y: 6.5,
  /** Ceiling on the climb, as a multiple of pole height. */
  SCROLL_MAX_Y_MULTIPLIER: 1.8,
  /** Radians of orbit per pixel of horizontal drag. */
  ORBIT_SPEED: 0.01,
  /** Exponential easing on the vertical glide; lower is smoother. */
  EASING_FACTOR: 0.15,
  /** Momentum decay per frame once the drag is released. */
  FRICTION: 0.92,
  FOV: 60,
  NEAR: 0.1,
  FAR: 200,
  POSITION: [0, 6, 5] as [number, number, number],
  /** Portrait viewports pull back so the pole still fits the frame. */
  PORTRAIT_POSITION: [0, 6, 6] as [number, number, number],
  TARGET: [0, 6, 0] as [number, number, number],
} as const

export const POLE = {
  /* Geometry is authored at unit radius and scaled up as a group, so every
     figure below is in pole-local units: the pole is 2 across and 40 tall in
     world space, which is what the camera distances are tuned against. */
  SCALE: 2,
  RADIUS: 1,
  HEIGHT: 20,
  DECAL_SIZE: 1,
  MAX_DECAL_WIDTH: 1.5,
  /** Keeps a flyer from hanging off either end of the pole. */
  DECAL_MARGIN_MIN: 0.02,
  DECAL_MARGIN_MAX: 0.1,
  DECAL_MARGIN_MULTIPLIER: 0.02,
  /* Each flyer sits a hair further out than the last, so stacked decals
     resolve by depth order instead of fighting over the same shell. */
  Z_FIGHTING_OFFSET: 0.01,
  Z_FIGHTING_INCREMENT: 0.0005,
  /** Where the seed flyer lands: negative angles face left of camera. */
  INITIAL_DECAL_ANGLE: -0.9,
  INITIAL_DECAL_HEIGHT: 3,
  /** Half-width of the random tilt given to each added flyer, in degrees. */
  MAX_TILT_DEGREES: 3.5,
  /** The seed flyer's tilt is chosen, not rolled, so the page opens the same
   *  way every time. Radians. */
  SEED_TILT: -0.045,
} as const

/* Wood from everytexture.com (stock texture 00086), 1024px maps. */
export const WOOD_TEXTURE_PATHS = {
  map: "/decal-pole/wood-diffuse.jpg",
  normalMap: "/decal-pole/wood-normal.jpg",
  bumpMap: "/decal-pole/wood-bump.jpg",
} as const

export const FLYER_TEXTURE_PATH = "/decal-pole/lost-hamter.jpg"

export const WOOD = {
  ANISOTROPY: 8,
  /** Derive the vertical repeat from the pole's proportions. */
  AUTO_TILE: true,
  TILE_X: 2,
  TILE_Y: 2,
} as const

export const ENVIRONMENT = {
  PRESET: "city",
  BACKGROUND: true,
  BLUR: 0.1,
} as const

type WoodTextures = {
  map?: Texture
  normalMap?: Texture
  bumpMap?: Texture
}

/** A flyer sits flush against the pole only if it clears both ends. */
function clampToPole(height: number, poleHeight: number): number {
  const margin = Math.max(
    POLE.DECAL_MARGIN_MIN,
    Math.min(POLE.DECAL_MARGIN_MAX, poleHeight * POLE.DECAL_MARGIN_MULTIPLIER),
  )
  return Math.min(poleHeight - margin, Math.max(margin, height))
}

/** Random tilt in radians, symmetric about upright. */
export function randomTilt(): number {
  return (Math.random() - 0.5) * 2 * POLE.MAX_TILT_DEGREES * (Math.PI / 180)
}

/**
 * Where a drop landed on the pole, by raycasting the pointer into the mesh.
 * Returns null when the pointer missed the pole entirely.
 */
export function decalPositionFromDrop(
  drop: DropPoint,
  mesh: Mesh,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  poleHeight: number,
): { angle: number; height: number } | null {
  const rect = canvas.getBoundingClientRect()
  const ndcX = ((drop.x - rect.left) / rect.width) * 2 - 1
  const ndcY = -(((drop.y - rect.top) / rect.height) * 2 - 1)

  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
  const hit = ray.intersectObject(mesh, false)[0]
  if (!hit) return null

  const local = mesh.worldToLocal(hit.point.clone())

  return {
    angle: Math.atan2(local.x, local.z),
    height: clampToPole(local.y + poleHeight / 2, poleHeight),
  }
}

/**
 * Fallback placement for flyers added without a pointer (the file picker):
 * staple it at eye level, on whichever face of the pole is being looked at.
 * The camera is in world space and the pole is scaled, so the height has to
 * come back down into pole-local units.
 */
export function decalPositionFromCamera(
  camera: THREE.Camera,
  poleHeight: number,
): { angle: number; height: number } {
  return {
    angle: Math.atan2(camera.position.x, camera.position.z),
    height: clampToPole(camera.position.y / POLE.SCALE, poleHeight),
  }
}

export function configureDecalTexture(texture: Texture): void {
  texture.flipY = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.center.set(0.5, 0.5)
  // The decal projection swaps the UV axes, so V is what mirrors horizontally.
  texture.repeat.set(1, -1)
  texture.needsUpdate = true
}

/** Fit the flyer to MAX_DECAL_WIDTH without distorting its aspect. */
export function decalScale(
  textureWidth: number,
  textureHeight: number,
): { sx: number; sy: number } {
  const aspect = textureWidth / Math.max(1, textureHeight)
  const sx = Math.min(POLE.MAX_DECAL_WIDTH, POLE.DECAL_SIZE * aspect)
  return { sx, sy: sx / aspect }
}

export function configureWoodTextures(wood: WoodTextures): void {
  for (const texture of [wood.map, wood.normalMap, wood.bumpMap]) {
    if (!texture) continue
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = WOOD.ANISOTROPY
  }
}

/**
 * How often the wood repeats around and up the pole. Auto-tiling keeps the
 * grain square by scaling the vertical repeat to the circumference; TILE_X and
 * TILE_Y then act as multipliers on that. With AUTO_TILE off they are the
 * repeat counts outright.
 */
export function woodTextureRepeat(
  radius: number,
  height: number,
): { uRepeat: number; vRepeat: number } {
  if (!WOOD.AUTO_TILE) {
    return { uRepeat: WOOD.TILE_X, vRepeat: WOOD.TILE_Y }
  }

  const circumference = 2 * Math.PI * radius
  const autoVRepeat = Math.max(1, height / Math.max(1e-6, circumference))

  return { uRepeat: WOOD.TILE_X, vRepeat: autoVRepeat * WOOD.TILE_Y }
}

export function applyWoodRepeat(wood: WoodTextures, uRepeat: number, vRepeat: number): void {
  for (const texture of [wood.map, wood.normalMap, wood.bumpMap]) {
    if (!texture) continue
    texture.repeat.set(uRepeat, vRepeat)
    texture.needsUpdate = true
  }
}
