import { STEPS, Sequencer, midiToHz, pattern, type Step } from "./sequencer"

const KICK = pattern("X.........X..x..")
const CLAP = pattern("....X.......X...")
const HAT = pattern("x.X.x.X.x.X.xxX.")

/** One chord a bar: root for the sub, voicing for the pad. */
const PROGRESSION = [
  { root: 33, chord: [57, 60, 64, 67, 71] }, // Am9
  { root: 29, chord: [53, 57, 60, 64, 67] }, // Fmaj9
  { root: 36, chord: [48, 55, 59, 62, 64] }, // Cmaj9
  { root: 28, chord: [52, 55, 59, 62, 66] }, // Em9
]

const LOOKAHEAD = 0.12
const TICK_MS = 25
const FADE = 0.35
/** Master level at full volume, under the compressor's knee. */
const HEADROOM = 0.8
/** How fast the light from a hit dies away, per second. */
const KICK_DECAY = 4.5
const CLAP_DECAY = 7

type Hit = { time: number; velocity: number }

/** What the shader sees of the beat this frame. */
export type BeatPulse = {
  /** 0–1, the latest kick's flare. */
  kick: number
  /** Seconds since that kick, for the shell it throws. */
  kickAge: number
  /** 0–1, the latest clap's flare. */
  clap: number
}

/** A generated downtempo beat: kick, clap and hats over a sub and a pad, with
 *  a synthesized room. Nothing loads; every voice is built per hit. */
export class AuroraBeat {
  playing = false

  private level = 0.8
  private sequencer = new Sequencer(88, 0.18)
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private suspendTimer: ReturnType<typeof setTimeout> | undefined
  /** Scheduled but not yet heard, oldest first. */
  private kicks: Hit[] = []
  private claps: Hit[] = []
  private lastKick: Hit | null = null
  private lastClap: Hit | null = null

  get volume() {
    return this.level
  }

  get bpm() {
    return this.sequencer.bpm
  }

  setBpm(bpm: number) {
    this.sequencer.bpm = bpm
  }

  /** Call from a user gesture: browsers only let audio start from one. */
  async start() {
    if (this.playing) return
    const ctx = this.ctx ?? this.build()
    clearTimeout(this.suspendTimer)
    this.playing = true

    const resumed = ctx.resume()
    const now = ctx.currentTime
    this.sequencer.reset(now + 0.05)
    this.rampMaster(this.level, FADE)
    this.startTimer()
    await resumed
  }

  stop() {
    const ctx = this.ctx
    if (!ctx || !this.playing) return

    this.playing = false
    clearInterval(this.timer)
    this.rampMaster(0, FADE)
    this.kicks.length = 0
    this.claps.length = 0
    this.lastKick = null
    this.lastClap = null
    this.suspendTimer = setTimeout(() => void ctx.suspend(), (FADE + 0.1) * 1000)
  }

  setVolume(volume: number) {
    this.level = volume
    if (this.playing) this.rampMaster(volume, 0.08)
  }

  /** A hidden tab's timers are throttled to a crawl, so rather than stutter,
   *  hold the whole clock and pick up where it left off. */
  setHidden(hidden: boolean) {
    const ctx = this.ctx
    if (!ctx || !this.playing) return

    if (hidden) {
      clearInterval(this.timer)
      void ctx.suspend()
    } else {
      void ctx.resume()
      this.startTimer()
    }
  }

  dispose() {
    clearInterval(this.timer)
    clearTimeout(this.suspendTimer)
    void this.ctx?.close()
    this.ctx = null
    this.playing = false
    this.kicks.length = 0
    this.claps.length = 0
    this.lastKick = null
    this.lastClap = null
  }

  /** Read off the audio clock at the speakers, so light lands with sound. */
  pulse(out: BeatPulse): BeatPulse {
    out.kick = 0
    out.kickAge = 1e3
    out.clap = 0

    const ctx = this.ctx
    if (!ctx || !this.playing) return out

    const now = heardTime(ctx)
    while (this.kicks.length > 0 && this.kicks[0].time <= now) {
      this.lastKick = this.kicks.shift() ?? null
    }
    while (this.claps.length > 0 && this.claps[0].time <= now) {
      this.lastClap = this.claps.shift() ?? null
    }

    if (this.lastKick) {
      out.kickAge = now - this.lastKick.time
      out.kick = this.lastKick.velocity * Math.exp(-out.kickAge * KICK_DECAY)
    }
    if (this.lastClap) {
      out.clap = this.lastClap.velocity * Math.exp(-(now - this.lastClap.time) * CLAP_DECAY)
    }
    return out
  }

  private build(): AudioContext {
    // Lets iOS play through the silent switch, like a video would.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = "playback"

    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 3
    master.connect(compressor).connect(ctx.destination)

    const dry = ctx.createGain()
    dry.connect(master)

    const wet = ctx.createGain()
    const room = ctx.createConvolver()
    room.buffer = impulse(ctx, 3.2, 2.6)
    const roomReturn = ctx.createGain()
    roomReturn.gain.value = 0.5
    wet.connect(room).connect(roomReturn).connect(master)

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

    this.ctx = ctx
    this.master = master
    this.dry = dry
    this.wet = wet
    this.noise = noise
    return ctx
  }

  private startTimer() {
    clearInterval(this.timer)
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  private tick() {
    const ctx = this.ctx
    if (!ctx) return
    for (const step of this.sequencer.advance(ctx.currentTime, ctx.currentTime + LOOKAHEAD)) {
      this.play(step)
    }
  }

  private play({ step, bar, time }: Step) {
    const { root, chord } = PROGRESSION[bar % PROGRESSION.length]
    const { stepSeconds } = this.sequencer

    if (step === 0) this.pad(time, chord, stepSeconds * STEPS)
    if (KICK[step]) {
      this.kick(time, KICK[step])
      // Held until just short of the next kick, so the subs never overlap.
      const next = KICK.findIndex((velocity, i) => i > step && velocity > 0)
      this.bass(time, midiToHz(root), ((next < 0 ? STEPS : next) - step - 0.3) * stepSeconds)
      this.kicks.push({ time, velocity: KICK[step] })
    }
    if (CLAP[step]) {
      this.clap(time, CLAP[step])
      this.claps.push({ time, velocity: CLAP[step] })
    }
    if (HAT[step]) this.hat(time, HAT[step])
  }

  private kick(time: number, velocity: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.13)
    const gain = envelope(ctx, time, velocity * 0.9, 0.004, 0.5)
    osc.connect(gain)
    this.send(gain, 0.05)
    osc.start(time)
    osc.stop(time + 0.55)
  }

  private clap(time: number, velocity: number) {
    const ctx = this.ctx!
    const source = this.noiseSource(time, 0.3)
    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = 1400
    band.Q.value = 0.8
    const gain = envelope(ctx, time, velocity * 0.45, 0.002, 0.24)
    source.connect(band).connect(gain)
    this.send(gain, 0.55)

    const body = ctx.createOscillator()
    body.type = "triangle"
    body.frequency.setValueAtTime(200, time)
    body.frequency.exponentialRampToValueAtTime(130, time + 0.08)
    const bodyGain = envelope(ctx, time, velocity * 0.22, 0.002, 0.1)
    body.connect(bodyGain)
    this.send(bodyGain, 0.3)
    body.start(time)
    body.stop(time + 0.12)
  }

  private hat(time: number, velocity: number) {
    const ctx = this.ctx!
    const source = this.noiseSource(time, 0.08)
    const high = ctx.createBiquadFilter()
    high.type = "highpass"
    high.frequency.value = 7800
    const gain = envelope(ctx, time, velocity * 0.14, 0.001, 0.05)
    source.connect(high).connect(gain)
    this.send(gain, 0.2)
  }

  private bass(time: number, frequency: number, length: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(0.32, time + 0.02)
    gain.gain.setTargetAtTime(0.18, time + 0.02, 0.2)
    gain.gain.setTargetAtTime(0.0001, time + length, 0.08)
    osc.connect(gain)
    this.send(gain, 0)
    osc.start(time)
    osc.stop(time + length + 0.5)
  }

  /** Two detuned saws a note, darkened, swelling in over the bar and ringing
   *  into the next. */
  private pad(time: number, chord: number[], length: number) {
    const ctx = this.ctx!
    const filter = ctx.createBiquadFilter()
    filter.type = "lowpass"
    filter.Q.value = 0.6
    filter.frequency.setValueAtTime(500, time)
    filter.frequency.linearRampToValueAtTime(1300, time + length * 0.6)
    filter.frequency.linearRampToValueAtTime(700, time + length + 1.5)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(0.05, time + 0.9)
    gain.gain.setValueAtTime(0.05, time + length)
    gain.gain.linearRampToValueAtTime(0, time + length + 1.5)
    filter.connect(gain)
    this.send(gain, 0.9)

    for (const note of chord) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator()
        osc.type = "sawtooth"
        osc.frequency.value = midiToHz(note)
        osc.detune.value = detune
        osc.connect(filter)
        osc.start(time)
        osc.stop(time + length + 1.6)
      }
    }
  }

  private noiseSource(time: number, length: number): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource()
    source.buffer = this.noise
    source.start(time, Math.random() * 0.5, length)
    return source
  }

  /** Into the mix dry, with `amount` of it also sent to the room. */
  private send(node: AudioNode, amount: number) {
    node.connect(this.dry!)
    if (amount <= 0) return
    const send = this.ctx!.createGain()
    send.gain.value = amount
    node.connect(send).connect(this.wet!)
  }

  private rampMaster(target: number, seconds: number) {
    const ctx = this.ctx
    const gain = this.master?.gain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(target * HEADROOM, now + seconds)
  }
}

/** A percussive gain: a quick rise to `peak`, then an exponential fall. */
function envelope(
  ctx: AudioContext,
  time: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(peak, time + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
  return gain
}

/** Stereo noise under a power-curve decay: a room with no walls. */
function impulse(ctx: AudioContext, seconds: number, falloff: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** falloff
    }
  }
  return buffer
}

/** The context time now reaching the speakers, output latency included. */
function heardTime(ctx: AudioContext): number {
  const stamp = ctx.getOutputTimestamp?.()
  // Zeroed until the first buffer reaches the device.
  if (stamp?.contextTime !== undefined && stamp.performanceTime) {
    const heard = stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
    return Math.min(heard, ctx.currentTime)
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
}
