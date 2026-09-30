/** Sixteenth-note steps per bar. */
export const STEPS = 16

export type Step = {
  /** 0–15 within the bar. */
  step: number
  bar: number
  /** Audio-clock seconds, swing included. */
  time: number
}

/** "X" is an accent, "x" a ghost note, anything else a rest. */
export function pattern(steps: string): number[] {
  return Array.from(steps, (char) => (char === "X" ? 1 : char === "x" ? 0.45 : 0))
}

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

/** A sixteenth-note grid laid over the audio clock. It knows nothing of Web
 *  Audio, so the scheduler's timing can be tested without an AudioContext. */
export class Sequencer {
  bpm: number
  /** Share of a step that the off-beat sixteenths lag by. */
  swing: number

  private step = 0
  private bar = 0
  /** Unswung start of `step`. */
  private gridTime = 0

  constructor(bpm: number, swing = 0) {
    this.bpm = bpm
    this.swing = swing
  }

  get stepSeconds(): number {
    return 60 / this.bpm / 4
  }

  /** Starts over on the downbeat of bar 0, landing at `time`. */
  reset(time: number) {
    this.step = 0
    this.bar = 0
    this.gridTime = time
  }

  /** Every step starting before `until`, each exactly once across calls. Steps
   *  already behind `now` (a throttled timer, a stalled tab) are dropped rather
   *  than played late as a flam, and the grid keeps its phase. */
  advance(now: number, until: number): Step[] {
    if (this.gridTime < now) {
      this.skip(Math.ceil((now - this.gridTime) / this.stepSeconds))
    }

    const steps: Step[] = []
    while (this.gridTime < until) {
      const lag = this.step % 2 === 1 ? this.swing * this.stepSeconds : 0
      steps.push({ step: this.step, bar: this.bar, time: this.gridTime + lag })
      this.skip(1)
    }
    return steps
  }

  private skip(count: number) {
    this.gridTime += count * this.stepSeconds
    const total = this.step + count
    this.bar += Math.floor(total / STEPS)
    this.step = total % STEPS
  }
}
