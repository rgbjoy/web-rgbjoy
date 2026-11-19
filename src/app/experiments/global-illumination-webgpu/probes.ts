/**
 * The probe volume's layout: probes through the room's air, half a metre
 * apart and a quarter metre in from every wall. The room's inside runs
 * x −3.5…3.5, y 0…4.5, z −6…6 (room.ts), so 14 × 9 × 24 of them.
 */
export const PROBE_GRID = [14, 9, 24] as const
export const PROBE_SPACING = 0.5
export const PROBE_ORIGIN = [-3.25, 0.25, -5.75] as const
export const PROBE_COUNT = PROBE_GRID[0] * PROBE_GRID[1] * PROBE_GRID[2]

/**
 * When the probes update, and how much each update counts. The first frames
 * after a change are a plain mean, so the volume fills in fast; after that
 * a floor keeps each frame counting for something, because every update also
 * adds a bounce on top of the last and the answer is still moving. Once it
 * has stopped moving the probes stop updating: the scene holds still.
 */
export class ProbeSchedule {
  frames = 0

  constructor(
    readonly limit: number,
    readonly floor = 0.05,
  ) {}

  reset() {
    this.frames = 0
  }

  pending() {
    return this.frames < this.limit
  }

  /** The weight for the next update. */
  next() {
    const n = this.frames++
    return Math.max(1 / (n + 1), this.floor)
  }
}

/**
 * A uniformly random rotation as a column-major 3×3 matrix (Shoemake's
 * random unit quaternion), so successive frames' rays sweep new directions.
 */
export function randomRotation(random: () => number = Math.random): number[] {
  const u1 = random()
  const u2 = random() * Math.PI * 2
  const u3 = random() * Math.PI * 2
  const a = Math.sqrt(1 - u1)
  const b = Math.sqrt(u1)
  const x = a * Math.sin(u2)
  const y = a * Math.cos(u2)
  const z = b * Math.sin(u3)
  const w = b * Math.cos(u3)
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ]
}
