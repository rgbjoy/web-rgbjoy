export const IDLE_ROUTINES = ['search', 'dance'] as const
export type IdleRoutine = (typeof IDLE_ROUTINES)[number]
export type IdleActivity = 'waiting' | IdleRoutine

export const IDLE_DURATION: Record<IdleRoutine, number> = {
  search: 6.8,
  dance: 8.6,
}

export type IdlePose = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  stretch: number
  headYaw: number
  headPitch: number
  headRoll: number
  squint: number
  flutter: number
}

const NEUTRAL: IdlePose = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  stretch: 1,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  squint: 0,
  flutter: 0,
}

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

function envelope(time: number, duration: number, enter = 0.8, exit = 0.8) {
  return smooth(time / enter) * smooth((duration - time) / exit)
}

/** Writes into one reusable pose. Every routine returns to the same resting
 * position; the dance's final 2π orientation is equivalent to its start. */
export function sampleIdle(activity: IdleActivity, time: number, out: IdlePose) {
  Object.assign(out, NEUTRAL)
  if (activity === 'waiting') return out
  const duration = IDLE_DURATION[activity]
  const w = envelope(time, duration)

  if (activity === 'search') {
    out.x = Math.sin(time * 1.25) * 0.06 * w
    out.z = 0.16 * w
    out.headYaw = Math.sin(time * 1.3 - 0.8) * 0.43 * w
    out.headPitch = (-0.05 + Math.sin(time * 1.9) * 0.045) * w
    out.headRoll = Math.sin(time * 0.9) * 0.09 * w
    out.squint = (0.65 + Math.sin(time * 2.1) * 0.045) * w
  } else if (activity === 'dance') {
    const beat = time * Math.PI * 2 * 1.45
    const bounce = (1 - Math.cos(beat)) * 0.5
    out.x = Math.sin(time * Math.PI * 1.2) * 0.15 * w
    out.y = bounce * 0.19 * w
    out.roll = Math.sin(time * Math.PI * 2 * 0.72) * 0.12 * w
    out.pitch = Math.sin(beat * 0.5) * 0.055 * w
    // Finish at 2π: blending this angle back to zero adds a reverse spin.
    out.yaw = Math.PI * 2 * smooth((time - 2.1) / 4.4)
    out.stretch = 1 - Math.cos(beat) * 0.065 * w
    out.headYaw = Math.sin(beat * 0.5) * 0.1 * w
    out.headPitch = -Math.cos(beat) * 0.07 * w
    out.headRoll = Math.sin(beat * 0.5) * 0.12 * w
    out.squint = bounce * 0.18 * w
    out.flutter = 0.65 * w
  }
  return out
}

/** Shuffling gives each routine a turn in a new random order.
 * Quiet gaps keep the performances from becoming a continuous dance loop. */
export class IdleDirector {
  activity: IdleActivity = 'waiting'
  private time = 0
  private wait = 3.5
  private bag: IdleRoutine[] = []
  private previous: IdleRoutine | null = null
  private readonly pose = { ...NEUTRAL }

  constructor(private readonly random: () => number = Math.random) {}

  start(routine: IdleRoutine) {
    this.activity = routine
    this.previous = routine
    this.time = 0
  }

  update(delta: number, attention: boolean, reducedMotion: boolean) {
    if (reducedMotion) {
      this.activity = 'waiting'
      this.time = 0
      this.wait = 3.5
    } else if (attention && this.activity === 'search') {
      // It found you: perk up and resume eye contact.
      this.finish()
    } else if (this.activity === 'waiting') {
      if (!attention) {
        this.wait -= delta
        if (this.wait <= 0) this.start(this.pick())
      }
    } else {
      this.time += delta
      if (this.time >= IDLE_DURATION[this.activity]) this.finish()
    }
    return sampleIdle(this.activity, this.time, this.pose)
  }

  private finish() {
    this.activity = 'waiting'
    this.time = 0
    this.wait = 5 + this.random() * 5
  }

  private pick() {
    if (this.bag.length === 0) {
      this.bag = [...IDLE_ROUTINES]
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1))
        ;[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]
      }
      if (this.bag[0] === this.previous) {
        ;[this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]]
      }
    }
    return this.bag.shift()!
  }
}
