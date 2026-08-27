export type FlowerVariant = "pink" | "white"

/**
 * Dock pads are the fixed tutorial run: they sit on the planks, so overshooting
 * one lands you on bare decking rather than in the water. Lily pads are
 * generated endlessly ahead of the frog.
 */
export type PadSurface = "dock" | "lily"

export type PadDefinition = {
  id: string
  position: [number, number, number]
  radius: number
  surface: PadSurface
  nextTargetId?: string
  flower?: FlowerVariant
  /** World-space XZ offset of the decorative flower cluster from this pad. */
  flowerOffset?: [number, number]
  /** Multiplier on the generated wind. 0 is dead calm — used to ease players in. */
  windScale?: number
  /** Coaching line shown while this pad is the active target. */
  hint?: string
}

// Top faces of the world's three surfaces. The dock stands clear of the water
// so the hop out to the first lily is a step *down* — see `restHeightAt`.
export const WATER_SURFACE_Y = -0.03
export const LILY_SURFACE_Y = 0.14
export const DOCK_SURFACE_Y = 0.26
export const POND_DEPTH = 1.55
export const POND_FLOOR_Y = -POND_DEPTH
export const POND_FOG_COLOR = "#78afb0"
export const POND_FOG_NEAR = 18
export const POND_FOG_FAR = 38

/** Gap between a surface and the frog's origin when it is standing on it. */
export const FROG_FOOT_CLEARANCE = 0.04
export const DOCK_REST_Y = DOCK_SURFACE_Y + FROG_FOOT_CLEARANCE
export const LILY_REST_Y = LILY_SURFACE_Y + FROG_FOOT_CLEARANCE

export const DOCK_BOUNDS = {
  minX: -6,
  maxX: 6,
  minZ: 3.8,
  // Carries the decking behind the chase camera so its rear edge never enters
  // the bottom of the frame at the starting position.
  maxZ: 20.5,
} as const

export function isOnDock(position: { x: number; z: number }) {
  return (
    position.x >= DOCK_BOUNDS.minX &&
    position.x <= DOCK_BOUNDS.maxX &&
    position.z >= DOCK_BOUNDS.minZ &&
    position.z <= DOCK_BOUNDS.maxZ
  )
}

export const DOCK_START_POSITION: [number, number, number] = [0, DOCK_REST_Y, 13.1]
export const FIRST_HINT =
  "Drag back from the frog and release — the ghost ring shows where you land."

// ── Generation tuning ────────────────────────────────────────────────────────

/** Pads kept alive ahead of / behind the frog. Everything else is culled. */
const LOOK_AHEAD = 5
const KEEP_BEHIND = 2

/**
 * Hop lengths, kept comfortably inside MAX_HOP_DISTANCE (6.6) so that even the
 * diagonal onto or off a bail-out pad stays reachable — see ALT_OFFSET.
 */
const HOP_MIN = 3.2
const HOP_MAX = 5.0
/** Max heading deviation from straight down the pond, radians (~34°). */
const MAX_SPREAD = 0.6
const ALT_CHANCE = 0.45
/** Lateral offset of a bail-out pad from the main one. */
const ALT_OFFSET_MIN = 2.4
const ALT_OFFSET_MAX = 2.9
/**
 * Hard reachability ceiling for the hops into and out of a bail-out pad, kept
 * under MAX_HOP_DISTANCE (6.6) with margin. A bail-out that can't be left is a
 * dead end, so any candidate breaching this is simply dropped.
 */
const ALT_MAX_SPAN = 6.0
/** Visible XZ radius reserved for a flower and all of its satellite pads. */
export const FLOWER_CLUSTER_RADIUS = 1.28
/** Central petal footprint used to keep satellite pads from touching it. */
export const FLOWER_BASE_RADIUS = 0.54
export const FLOWER_SATELLITE_GAP = 0.1
const OBJECT_CLEARANCE = 0.24

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Ids carry the run seed because wind is hashed from the pad id — without it
 * every run would blow exactly the same way at the same pad number.
 */
export function lilyId(seed: number, index: number) {
  return `l${seed.toString(36)}-${index}`
}

/** Drifting scenery. Purely decorative, but it has to keep off the pads. */
export type LogDefinition = {
  id: string
  position: [number, number, number]
  length: number
  /** Conservative circular XZ footprint, including bends and the side twig. */
  radius: number
  rotation: number
}

export type Course = {
  seed: number
  /** Live pads: the dock prologue plus a rolling window of lilies. */
  pads: PadDefinition[]
  byId: Map<string, PadDefinition>
  /** Index of the furthest lily generated. */
  head: number
  /** Index of the lily the frog is on; -1 while still on the dock. */
  cursor: number
  /** Where the next lily grows from. */
  frontier: { x: number; z: number; meander: number }
  /** Lilies generated this run, for pruning bookkeeping. */
  lilies: Map<number, PadDefinition[]>
  /** At most one drifting log per lily index, culled on the same schedule. */
  logs: Map<number, LogDefinition>
}

function dockPads(seed: number): PadDefinition[] {
  return [
    {
      id: "dock-start",
      position: DOCK_START_POSITION,
      radius: 1.6,
      surface: "dock",
      nextTargetId: "mark-a",
    },
    {
      id: "mark-a",
      position: [0.15, DOCK_REST_Y, 9.85],
      radius: 1.4,
      surface: "dock",
      nextTargetId: "mark-b",
      windScale: 0,
      hint: FIRST_HINT,
    },
    {
      id: "mark-b",
      position: [2.65, DOCK_REST_Y, 7.35],
      radius: 1.2,
      surface: "dock",
      nextTargetId: "mark-c",
      windScale: 0.28,
      hint: "A breeze now. The arrow shows which way it pushes — aim into it.",
    },
    {
      id: "mark-c",
      position: [-1.35, DOCK_REST_Y, 5.55],
      radius: 1.15,
      surface: "dock",
      nextTargetId: lilyId(seed, 0),
      hint: "Full wind. Land this one and the pond opens up.",
    },
  ]
}

/**
 * Clearance test against everything already placed — pads *and* logs. Logs have
 * to be in here: they used to be fixed scenery near the origin, and once pads
 * became randomly generated a pad would occasionally spawn straight through one.
 * Sticks carry a conservative circular footprint that includes their bend and
 * side twig. Flower clusters reserve their complete satellite-pad radius too.
 */
function collides(course: Course, x: number, z: number, radius: number) {
  for (const pad of course.pads) {
    const gap = Math.hypot(x - pad.position[0], z - pad.position[2])
    if (gap < radius + pad.radius + OBJECT_CLEARANCE) return true

    if (pad.flowerOffset) {
      const flowerX = pad.position[0] + pad.flowerOffset[0]
      const flowerZ = pad.position[2] + pad.flowerOffset[1]
      const flowerGap = Math.hypot(x - flowerX, z - flowerZ)
      if (flowerGap < radius + FLOWER_CLUSTER_RADIUS + OBJECT_CLEARANCE) {
        return true
      }
    }
  }

  for (const log of course.logs.values()) {
    const gap = Math.hypot(x - log.position[0], z - log.position[2])
    const logRadius = log.radius ?? log.length * 0.5 + 0.34
    if (gap < radius + logRadius + OBJECT_CLEARANCE) return true
  }

  return false
}

function circleTouchesDock(x: number, z: number, radius: number) {
  const nearestX = Math.max(DOCK_BOUNDS.minX, Math.min(x, DOCK_BOUNDS.maxX))
  const nearestZ = Math.max(DOCK_BOUNDS.minZ, Math.min(z, DOCK_BOUNDS.maxZ))
  return Math.hypot(x - nearestX, z - nearestZ) < radius + OBJECT_CLEARANCE
}

/**
 * Finds a deterministic clear side for a flower cluster. If the surrounding
 * pond is crowded, decoration is omitted rather than clipped into gameplay.
 */
function flowerOffsetFor(
  course: Course,
  pad: PadDefinition,
  rand: () => number,
): [number, number] | undefined {
  const startAngle = rand() * Math.PI * 2
  const reach = pad.radius + FLOWER_CLUSTER_RADIUS + OBJECT_CLEARANCE + 0.16

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const angle = startAngle + (attempt / 16) * Math.PI * 2
    const offsetX = Math.cos(angle) * reach
    const offsetZ = Math.sin(angle) * reach
    const x = pad.position[0] + offsetX
    const z = pad.position[2] + offsetZ

    if (
      !circleTouchesDock(x, z, FLOWER_CLUSTER_RADIUS) &&
      !collides(course, x, z, FLOWER_CLUSTER_RADIUS)
    ) {
      return [offsetX, offsetZ]
    }
  }

  return undefined
}

function reindex(course: Course) {
  course.byId = new Map(course.pads.map((pad) => [pad.id, pad]))
}

/** Grows one more lily (plus an optional bail-out pad) off the frontier. */
function growLily(course: Course) {
  const index = course.head + 1
  const rand = mulberry32(
    Math.imul(course.seed ^ 0x9e3779b9, 0x85ebca6b) + index * 0x27d4eb2d,
  )
  const frontier = course.frontier

  // Bounded meander, plus a gentle pull back toward the middle of the pond so
  // an endless run can't wander off the side of the water.
  const centering = Math.max(-0.5, Math.min(0.5, -frontier.x / 9))
  const meander = Math.max(
    -MAX_SPREAD,
    Math.min(MAX_SPREAD, frontier.meander * 0.55 + (rand() * 2 - 1) * MAX_SPREAD),
  )
  const theta = Math.max(
    -MAX_SPREAD,
    Math.min(MAX_SPREAD, meander + centering),
  )

  const spanRoll = rand()
  const radius = 0.86 + rand() * 0.4
  const flowerRoll = rand()

  const span = HOP_MIN + spanRoll * (HOP_MAX - HOP_MIN)

  // Try the intended heading first, then fan outward through nearby headings
  // and distances. A candidate is accepted only when the complete radius is
  // clear; the old four straight-line attempts could still commit a collision.
  let x = 0
  let z = 0
  let placed = false
  const angleOffsets = [0, 0.16, -0.16, 0.32, -0.32, 0.48, -0.48, 0.64, -0.64]
  for (let distanceStep = 0; distanceStep < 4 && !placed; distanceStep += 1) {
    const candidateSpan = Math.min(5.85, span + distanceStep * 0.42)
    for (const angleOffset of angleOffsets) {
      const candidateTheta = Math.max(
        -0.92,
        Math.min(0.92, theta + angleOffset),
      )
      const candidateX = frontier.x + Math.sin(candidateTheta) * candidateSpan
      const candidateZ = frontier.z - Math.cos(candidateTheta) * candidateSpan
      if (collides(course, candidateX, candidateZ, radius)) continue

      x = candidateX
      z = candidateZ
      placed = true
      break
    }
  }

  // The pond ahead is open in normal generation. This emergency continuation
  // walks farther along the course heading until it finds a genuinely clear
  // circle instead of ever committing an overlapping pad.
  if (!placed) {
    let candidateSpan = 6.0
    do {
      x = frontier.x + Math.sin(theta) * candidateSpan
      z = frontier.z - Math.cos(theta) * candidateSpan
      candidateSpan += 0.4
    } while (collides(course, x, z, radius))
  }

  // Defensive cleanup for courses created by older hot-reloaded state, whose
  // sticks did not carry the newer full-footprint clearance radius.
  for (const [logIndex, log] of course.logs) {
    const gap = Math.hypot(x - log.position[0], z - log.position[2])
    const logRadius = log.radius ?? log.length * 0.5 + 0.34
    if (gap < radius + logRadius + OBJECT_CLEARANCE) {
      course.logs.delete(logIndex)
    }
  }

  const nextId = lilyId(course.seed, index + 1)
  const pad: PadDefinition = {
    id: lilyId(course.seed, index),
    position: [x, LILY_REST_Y, z],
    radius,
    surface: "lily",
    nextTargetId: nextId,
  }

  course.head = index
  course.frontier = { x, z, meander }
  course.lilies.set(index, [pad])
  course.pads.push(pad)

  if (flowerRoll < 0.45) {
    const flowerOffset = flowerOffsetFor(course, pad, rand)
    if (flowerOffset) {
      pad.flower = flowerRoll < 0.225 ? "pink" : "white"
      pad.flowerOffset = flowerOffset
    }
  }

  addLog(course, index, pad, rand)

  // The pad before this one now has both neighbours, so its bail-out can be
  // placed against the real through-line.
  addBailOut(course, index - 1)
}

const LOG_CHANCE = 0.5
const LOG_MIN_LENGTH = 1.7
const LOG_MAX_LENGTH = 2.6

/**
 * Drops a drifting log beside a pad, clear of everything already placed. Later
 * pads test against logs too (see `collides`), so a log can't be swallowed by a
 * pad generated after it either.
 */
function addLog(
  course: Course,
  index: number,
  pad: PadDefinition,
  rand: () => number,
) {
  if (rand() >= LOG_CHANCE) return

  const length = LOG_MIN_LENGTH + rand() * (LOG_MAX_LENGTH - LOG_MIN_LENGTH)
  const rotation = (rand() * 2 - 1) * Math.PI
  // Half-length is the footprint; a log lies flat across the water.
  const footprint = length * 0.5 + 0.34
  // Must clear `collides`' own margin against the parent pad, or every
  // candidate is rejected by the very pad it belongs to and no log ever spawns.
  const reach = pad.radius + footprint + 0.5

  // Most angles land on a neighbouring pad, so try a few before giving up.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const angle = rand() * Math.PI * 2
    const x = pad.position[0] + Math.cos(angle) * reach
    const z = pad.position[2] + Math.sin(angle) * reach

    // The dock isn't in the collision set, so keep logs off it explicitly.
    if (circleTouchesDock(x, z, footprint) || collides(course, x, z, footprint)) {
      continue
    }

    course.logs.set(index, {
      id: `${pad.id}L`,
      position: [x, 0.075, z],
      length,
      radius: footprint,
      rotation,
    })
    return
  }
}

/**
 * Main pad at a lily index, or the dock's last mark for index -1. Reads from
 * `pads` rather than `byId`, which is only rebuilt once generation settles.
 */
function mainPadAt(course: Course, index: number) {
  if (index < 0) return course.pads.find((pad) => pad.id === "mark-c")
  return course.lilies.get(index)?.[0]
}

/**
 * Offers pad `index` a bail-out neighbour, offset perpendicular to the chord
 * running from its predecessor to its successor. Placing it against that chord
 * — rather than against the incoming hop — is what keeps both the hop in and
 * the hop out short; offsetting from the incoming direction let the lateral
 * components compound into spans past MAX_HOP_DISTANCE, stranding the frog.
 */
function addBailOut(course: Course, index: number) {
  if (index < 0) return
  const batch = course.lilies.get(index)
  const main = batch?.[0]
  const previous = mainPadAt(course, index - 1)
  const next = course.lilies.get(index + 1)?.[0]
  if (!batch || !main || !previous || !next || batch.length > 1) return

  const rand = mulberry32(
    Math.imul(course.seed ^ 0x51ed270b, 0xc2b2ae35) + index * 0x9e3779b9,
  )
  if (rand() >= ALT_CHANCE) return

  const chordX = next.position[0] - previous.position[0]
  const chordZ = next.position[2] - previous.position[2]
  const chord = Math.hypot(chordX, chordZ) || 1
  // Perpendicular to the through-line.
  const perpX = -chordZ / chord
  const perpZ = chordX / chord

  const side = rand() < 0.5 ? -1 : 1
  const offset = ALT_OFFSET_MIN + rand() * (ALT_OFFSET_MAX - ALT_OFFSET_MIN)
  const radius = 0.72 + rand() * 0.18
  const x = main.position[0] + side * offset * perpX
  const z = main.position[2] + side * offset * perpZ

  if (collides(course, x, z, radius)) return

  const inSpan = Math.hypot(x - previous.position[0], z - previous.position[2])
  const outSpan = Math.hypot(next.position[0] - x, next.position[2] - z)
  if (inSpan > ALT_MAX_SPAN || outSpan > ALT_MAX_SPAN) return

  const alt: PadDefinition = {
    id: `${main.id}a`,
    position: [x, LILY_REST_Y, z],
    radius,
    surface: "lily",
    nextTargetId: main.nextTargetId,
  }
  batch.push(alt)
  course.pads.push(alt)
}

function prune(course: Course) {
  const cutoff = course.cursor - KEEP_BEHIND
  for (const [index, batch] of course.lilies) {
    if (index >= cutoff) continue
    course.lilies.delete(index)
    course.logs.delete(index)
    for (const pad of batch) {
      const at = course.pads.indexOf(pad)
      if (at >= 0) course.pads.splice(at, 1)
    }
  }
}

export function createCourse(seed: number): Course {
  const course: Course = {
    seed,
    pads: dockPads(seed),
    byId: new Map(),
    head: -1,
    cursor: -1,
    frontier: { x: -1.35, z: 5.55, meander: 0 },
    lilies: new Map(),
    logs: new Map(),
  }

  while (course.head < LOOK_AHEAD) growLily(course)
  reindex(course)
  return course
}

/** Index of a lily from its id, or -1 for dock pads and bail-out pads. */
export function lilyIndexOf(course: Course, padId: string) {
  for (const [index, batch] of course.lilies) {
    if (batch[0]?.id === padId) return index
  }
  return -1
}

/**
 * Called after every pad landing: moves the window forward and tops the course
 * back up. Bail-out pads don't advance the cursor — you're beside the path, not
 * further along it.
 *
 * Returns a *new* Course rather than mutating in place. The React Compiler
 * rejects mutating render-scope values from the frame loop, so the scene swaps
 * whole course objects instead.
 */
export function advanceCourse(course: Course, landedPadId: string): Course {
  const next: Course = {
    ...course,
    pads: course.pads.slice(),
    lilies: new Map(course.lilies),
    logs: new Map(course.logs),
    byId: new Map(course.byId),
  }

  const index = lilyIndexOf(next, landedPadId)
  if (index >= 0) next.cursor = index

  while (next.head < next.cursor + LOOK_AHEAD) growLily(next)
  prune(next)
  reindex(next)
  return next
}

/** Height a marker should sit at to read as resting on the pad. */
export function padSurfaceY(pad: PadDefinition) {
  return (pad.surface === "lily" ? LILY_SURFACE_Y : DOCK_SURFACE_Y) + 0.015
}

/**
 * Height of whatever is directly below a point — used to lay the frog's drop
 * shadow onto the ground it is passing over. Unlike `findLandingPad` this uses
 * the pad's *full* radius, so the shadow rides the pad's visible edge rather
 * than popping at the stricter landing radius.
 */
export function surfaceHeightAt(pads: PadDefinition[], x: number, z: number) {
  for (const pad of pads) {
    const dx = x - pad.position[0]
    const dz = z - pad.position[2]
    if (Math.hypot(dx, dz) <= pad.radius) {
      return pad.surface === "lily" ? LILY_SURFACE_Y : DOCK_SURFACE_Y
    }
  }

  return isOnDock({ x, z }) ? DOCK_SURFACE_Y : WATER_SURFACE_Y
}

/** Where the frog's origin ends up standing at a given spot. */
export function restHeightAt(pads: PadDefinition[], x: number, z: number) {
  return surfaceHeightAt(pads, x, z) + FROG_FOOT_CLEARANCE
}
