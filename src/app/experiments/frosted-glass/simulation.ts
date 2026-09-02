import type {
  Box3DModule,
  b3BodyId,
  b3Quat,
  b3Vec3,
  b3WorldId,
} from "box3d.js"

/** Half the visible height, in world metres. The shader maps ±HALF_HEIGHT to
 *  the top and bottom of the canvas, so world units are screen units. */
export const HALF_HEIGHT = 2.2
/** How far the slab runs back from the glass. Blur is keyed to this depth, so
 *  it doubles as the fog range. Adjustable at runtime — the sill and sides are
 *  built for the deepest setting and only the back wall moves. */
export const DEFAULT_SLAB_DEPTH = 3.0
export const MIN_SLAB_DEPTH = 0.8
export const MAX_SLAB_DEPTH = 7
/** Top face of the sill the pile rests on — a little above the bottom edge, so
 *  the hairline reads as a shelf rather than the frame. */
export const FLOOR_Y = -HALF_HEIGHT * 0.76
/** Uniform array length in the shader; the TS side must not exceed it. */
export const MAX_GRAINS = 64

const FIXED_STEP = 1 / 60
const SUB_STEPS = 4
/** Seconds of simulation run before the first frame, so the sill starts with a
 *  pile instead of filling up while you watch. */
const PREWARM = 4.5
const FADE_IN = 0.5
const FADE_OUT = 0.8
/** A grain has to hold still this long before it is eligible for recycling. */
const SETTLE_HOLD = 0.4

const IDENTITY: b3Quat = [0, 0, 0, 1]

type Grain = {
  body: b3BodyId
  /** Capsule radius, or bead radius when halfLength is 0. */
  radius: number
  halfLength: number
  /** 0 while retiring or newly spawned, 1 once fully present. */
  fade: number
  retiring: boolean
  spawnedAt: number
  /** Simulation time the grain fell asleep, or null while it is moving. */
  sleepingSince: number | null
}

export type SimulationOptions = {
  count: number
  aspect: number
  depth?: number
  seed?: number
}

export type Simulation = ReturnType<typeof createSimulation>

/** Deterministic RNG so a given seed always packs the sill the same way. */
function mulberry32(seed: number) {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Rotates the capsule's local axis (0, len, 0) by a quaternion, writing the
 * result into `out`. Inlined rather than routed through three's Vector3 so the
 * per-frame read stays allocation free.
 */
export function rotateAxis(out: b3Vec3, q: b3Quat, len: number) {
  const [x, y, z, w] = q

  out[0] = 2 * len * (x * y - z * w)
  out[1] = len - 2 * len * (x * x + z * z)
  out[2] = 2 * len * (x * w + y * z)
}

function clampDepth(value: number) {
  return Math.min(MAX_SLAB_DEPTH, Math.max(MIN_SLAB_DEPTH, value))
}

export function createSimulation(b3: Box3DModule, options: SimulationOptions) {
  const random = mulberry32(options.seed ?? 20260902)

  let halfWidth = HALF_HEIGHT * options.aspect
  let slabDepth = clampDepth(options.depth ?? DEFAULT_SLAB_DEPTH)
  let elapsed = 0
  let accumulator = 0
  let gravity = 7.4
  let dropInterval = 1.1
  let knockStrength = 3.2
  let nextDropAt = dropInterval

  const worldDef = b3.b3DefaultWorldDef()
  worldDef.gravity = [0, -gravity, 0]
  const world: b3WorldId = b3.b3CreateWorld(worldDef)

  const wallShapeDef = b3.b3DefaultShapeDef()
  wallShapeDef.baseMaterial.friction = 0.55
  wallShapeDef.baseMaterial.restitution = 0.02

  /** Half-thickness of every static slab. Thick enough that a fast grain
   *  cannot tunnel through it between steps. */
  const WALL = 0.5

  function staticBox(
    position: b3Vec3,
    hx: number,
    hy: number,
    hz: number,
  ): b3BodyId {
    const def = b3.b3DefaultBodyDef()
    def.type = b3.b3BodyType.b3_staticBody
    def.position = position
    const body = b3.b3CreateBody(world, def)
    b3.b3CreateBoxShape(body, wallShapeDef, hx, hy, hz)
    return body
  }

  // The room: a sill to pile on, glass at z = 0 facing the viewer, a back wall,
  // and two sides that move with the aspect ratio. Everything reaches well above
  // the frame so grains queued up for the prewarm cannot slip past a corner.
  const WALL_HEIGHT = HALF_HEIGHT + 14
  const WALL_WIDTH = HALF_HEIGHT * 8

  const HALF_SPAN = MAX_SLAB_DEPTH / 2

  staticBox(
    [0, FLOOR_Y - WALL, -HALF_SPAN],
    WALL_WIDTH,
    WALL,
    HALF_SPAN + WALL,
  )
  staticBox([0, 0, WALL], WALL_WIDTH, WALL_HEIGHT, WALL)
  const backWall = staticBox(
    [0, 0, -slabDepth - WALL],
    WALL_WIDTH,
    WALL_HEIGHT,
    WALL,
  )
  const leftWall = staticBox(
    [-halfWidth - WALL, 0, -HALF_SPAN],
    WALL,
    WALL_HEIGHT,
    HALF_SPAN + WALL,
  )
  const rightWall = staticBox(
    [halfWidth + WALL, 0, -HALF_SPAN],
    WALL,
    WALL_HEIGHT,
    HALF_SPAN + WALL,
  )

  const grainShapeDef = b3.b3DefaultShapeDef()
  grainShapeDef.baseMaterial.friction = 0.62
  grainShapeDef.baseMaterial.restitution = 0.04
  grainShapeDef.baseMaterial.rollingResistance = 0.12

  const grains: Grain[] = []

  function spawnPosition(out: b3Vec3, radius: number, height: number) {
    // Dropped down the middle rather than across the whole pane, so the pile
    // heaps and spills outwards instead of laying itself out in one flat row.
    const margin = radius + 0.25
    out[0] = (random() * 2 - 1) * Math.max(0.2, halfWidth * 0.72 - margin)
    out[1] = height
    out[2] = -(
      radius +
      0.08 +
      random() * Math.max(0.05, slabDepth - 2 * radius - 0.3)
    )
  }

  function randomRotation(): b3Quat {
    // Uniform random unit quaternion (Shoemake), so nothing favours an axis.
    const u1 = random()
    const u2 = random() * Math.PI * 2
    const u3 = random() * Math.PI * 2
    const s1 = Math.sqrt(1 - u1)
    const s2 = Math.sqrt(u1)

    return [s1 * Math.sin(u2), s1 * Math.cos(u2), s2 * Math.sin(u3), s2 * Math.cos(u3)]
  }

  const scratchPosition: b3Vec3 = [0, 0, 0]

  function addGrain(index: number, count: number) {
    const isCapsule = random() < 0.58
    const radius = 0.1 + random() * 0.06
    const halfLength = isCapsule ? radius * (1.6 + random() * 1.9) : 0

    // Staggered above the view so the prewarm rains them in rather than
    // dropping one solid block.
    const height = HALF_HEIGHT + 0.8 + (index / count) * 9
    spawnPosition(scratchPosition, radius, height)

    const def = b3.b3DefaultBodyDef()
    def.type = b3.b3BodyType.b3_dynamicBody
    def.position = [...scratchPosition] as b3Vec3
    def.rotation = randomRotation()
    def.linearDamping = 0.06
    def.angularDamping = 0.35
    const body = b3.b3CreateBody(world, def)

    if (halfLength > 0) {
      b3.b3CreateCapsuleShape(body, grainShapeDef, {
        center1: [0, -halfLength, 0],
        center2: [0, halfLength, 0],
        radius,
      })
    } else {
      b3.b3CreateSphereShape(body, grainShapeDef, {
        center: [0, 0, 0],
        radius,
      })
    }

    grains.push({
      body,
      radius,
      halfLength,
      fade: 1,
      retiring: false,
      spawnedAt: 0,
      sleepingSince: null,
    })
  }

  const count = Math.min(options.count, MAX_GRAINS)
  for (let i = 0; i < count; i += 1) addGrain(i, count)

  function respawn(grain: Grain) {
    spawnPosition(
      scratchPosition,
      grain.radius,
      HALF_HEIGHT + 0.9 + random() * 1.4,
    )
    b3.b3Body_SetTransform(
      grain.body,
      [...scratchPosition] as b3Vec3,
      randomRotation(),
    )
    b3.b3Body_SetLinearVelocity(grain.body, [0, 0, 0])
    b3.b3Body_SetAngularVelocity(grain.body, [
      (random() * 2 - 1) * 1.6,
      (random() * 2 - 1) * 1.6,
      (random() * 2 - 1) * 1.6,
    ])
    b3.b3Body_SetAwake(grain.body, true)
    grain.spawnedAt = elapsed
    grain.sleepingSince = null
    grain.retiring = false
  }

  /** The grain that has been still the longest — the one at the bottom of the
   *  pile, so recycling reads as the heap slowly turning over. */
  function oldestSettled(): Grain | null {
    let best: Grain | null = null
    let bestTime = Infinity

    for (const grain of grains) {
      if (grain.retiring || grain.fade < 1) continue
      if (grain.sleepingSince === null) continue
      if (elapsed - grain.sleepingSince < SETTLE_HOLD) continue
      if (grain.sleepingSince < bestTime) {
        bestTime = grain.sleepingSince
        best = grain
      }
    }

    return best
  }

  function updateSleepState() {
    for (const grain of grains) {
      const awake = b3.b3Body_IsAwake(grain.body)

      if (awake) grain.sleepingSince = null
      else if (grain.sleepingSince === null) grain.sleepingSince = elapsed
    }
  }

  function updateFades(dt: number) {
    for (const grain of grains) {
      if (grain.retiring) {
        grain.fade -= dt / FADE_OUT
        if (grain.fade <= 0) {
          grain.fade = 0
          respawn(grain)
        }
      } else if (grain.fade < 1) {
        grain.fade = Math.min(1, grain.fade + dt / FADE_IN)
      }
    }
  }

  function scheduleDrop() {
    if (elapsed < nextDropAt) return

    const grain = oldestSettled()
    if (!grain) {
      // Nothing has settled yet; look again shortly rather than banking up
      // drops and dumping them all at once.
      nextDropAt = elapsed + 0.3
      return
    }

    grain.retiring = true
    nextDropAt = elapsed + dropInterval
  }

  function advance(dt: number) {
    b3.b3World_Step(world, dt, SUB_STEPS)
    elapsed += dt
    updateSleepState()
    updateFades(dt)
    scheduleDrop()
  }

  for (let i = 0; i < Math.round(PREWARM / FIXED_STEP); i += 1) {
    advance(FIXED_STEP)
  }
  // The prewarm is scaffolding, not history: everything it settled reads as
  // freshly placed, so nothing retires the instant the canvas appears.
  for (const grain of grains) {
    grain.fade = 1
    grain.retiring = false
    grain.spawnedAt = elapsed
  }
  nextDropAt = elapsed + dropInterval

  const position: b3Vec3 = [0, 0, 0]
  const rotation: b3Quat = [0, 0, 0, 1]
  const axis: b3Vec3 = [0, 0, 0]
  const order: number[] = grains.map((_, index) => index)
  const depths = new Float32Array(grains.length)
  /** Positions read once per frame and reused by the sort and the pack. */
  const centres = new Float32Array(grains.length * 3)

  return {
    /** World half-width at the current aspect ratio, for pointer mapping. */
    get halfWidth() {
      return halfWidth
    },

    /** Distance from the glass to the back wall. The shader reads this to know
     *  how far its haze has to reach. */
    get depth() {
      return slabDepth
    },

    step(dt: number) {
      // Cap the catch-up so a backgrounded tab does not return and spend a
      // second of frame time replaying its absence.
      accumulator = Math.min(accumulator + dt, 0.25)

      while (accumulator >= FIXED_STEP) {
        advance(FIXED_STEP)
        accumulator -= FIXED_STEP
      }
    },

    resize(aspect: number) {
      halfWidth = HALF_HEIGHT * aspect
      b3.b3Body_SetTransform(
        leftWall,
        [-halfWidth - WALL, 0, -MAX_SLAB_DEPTH / 2],
        IDENTITY,
      )
      b3.b3Body_SetTransform(
        rightWall,
        [halfWidth + WALL, 0, -MAX_SLAB_DEPTH / 2],
        IDENTITY,
      )
      for (const grain of grains) b3.b3Body_SetAwake(grain.body, true)
    },

    /** Slides the back wall towards or away from the glass. */
    setDepth(value: number) {
      slabDepth = clampDepth(value)
      b3.b3Body_SetTransform(backWall, [0, 0, -slabDepth - WALL], IDENTITY)

      for (const grain of grains) {
        b3.b3Body_GetPosition(position, grain.body)
        const limit = -(slabDepth - grain.radius)

        // Pulling the wall in would otherwise leave grains buried inside it,
        // which box3d resolves by flinging them out. Lift them clear first.
        if (position[2] < limit) {
          b3.b3Body_GetRotation(rotation, grain.body)
          b3.b3Body_SetTransform(
            grain.body,
            [position[0], position[1], limit + 0.02],
            rotation,
          )
        }

        b3.b3Body_SetAwake(grain.body, true)
      }
    },

    /** A knuckle on the glass: everything near the point is shoved outwards and
     *  pushed back into the fog, hardest for whatever was resting on the pane. */
    knock(x: number, y: number, radius = 1.6) {
      for (const grain of grains) {
        b3.b3Body_GetPosition(position, grain.body)

        const dx = position[0] - x
        const dy = position[1] - y
        const distance = Math.hypot(dx, dy)
        if (distance > radius) continue

        const falloff = 1 - distance / radius
        const nearGlass = 1 - Math.min(1, -position[2] / slabDepth)
        const speed =
          knockStrength * falloff * falloff * (0.35 + 0.65 * nearGlass)
        const mass = b3.b3Body_GetMass(grain.body)
        const nx = distance > 1e-4 ? dx / distance : 0
        const ny = distance > 1e-4 ? dy / distance : 1

        b3.b3Body_ApplyLinearImpulse(
          grain.body,
          [
            mass * speed * nx * 0.75,
            mass * speed * (0.35 + ny * 0.3),
            -mass * speed,
          ],
          // Struck on the glass plane rather than at the centre of mass, so the
          // grain tumbles away instead of sliding flat.
          [position[0], position[1], 0],
          true,
        )
      }
    },

    setGravity(value: number) {
      gravity = value
      b3.b3World_SetGravity(world, [0, -gravity, 0])
      for (const grain of grains) b3.b3Body_SetAwake(grain.body, true)
    },

    setDropInterval(value: number) {
      dropInterval = value
      nextDropAt = Math.min(nextDropAt, elapsed + value)
    },

    setKnockStrength(value: number) {
      knockStrength = value
    },

    /**
     * Packs every visible grain into the shader's uniform arrays, sorted back to
     * front so the fragment shader can composite them in one pass.
     *
     * segA: end A xy, depth of end A, radius.
     * segB: end B xy, depth of end B, fade.
     *
     * Depth is measured from the grain's surface to the glass, so anything
     * pressed against the pane reads as exactly zero.
     */
    write(segA: Float32Array, segB: Float32Array): number {
      for (let i = 0; i < grains.length; i += 1) {
        b3.b3Body_GetPosition(position, grains[i].body)
        centres[i * 3] = position[0]
        centres[i * 3 + 1] = position[1]
        centres[i * 3 + 2] = position[2]
        depths[i] = -position[2]
      }

      order.sort((a, b) => depths[b] - depths[a])

      let written = 0

      for (const index of order) {
        const grain = grains[index]
        if (grain.fade <= 0.001 || written >= MAX_GRAINS) continue

        b3.b3Body_GetRotation(rotation, grain.body)
        rotateAxis(axis, rotation, grain.halfLength)

        const cx = centres[index * 3]
        const cy = centres[index * 3 + 1]
        const cz = centres[index * 3 + 2]
        const slot = written * 4

        segA[slot] = cx + axis[0]
        segA[slot + 1] = cy + axis[1]
        segA[slot + 2] = Math.max(0, -(cz + axis[2]) - grain.radius)
        segA[slot + 3] = grain.radius

        segB[slot] = cx - axis[0]
        segB[slot + 1] = cy - axis[1]
        segB[slot + 2] = Math.max(0, -(cz - axis[2]) - grain.radius)
        segB[slot + 3] = grain.fade

        written += 1
      }

      return written
    },

    dispose() {
      b3.b3DestroyWorld(world)
    },
  }
}
