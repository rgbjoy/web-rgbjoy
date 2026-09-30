import { expect, test } from 'bun:test'

import { Sequencer, STEPS, midiToHz, pattern } from './sequencer'

// 150 bpm makes a sixteenth exactly 0.1 s.
const STEP = 0.1

test('overlapping lookahead windows schedule every step exactly once', () => {
  const sequencer = new Sequencer(150)
  sequencer.reset(0)

  const times: number[] = []
  for (let now = 0; now < 2; now += 0.025) {
    times.push(...sequencer.advance(now, now + 0.12).map((step) => step.time))
  }

  expect(times.length).toBeGreaterThan(19)
  times.forEach((time, i) => expect(time).toBeCloseTo(i * STEP, 9))
})

test('swing delays only the off-beat sixteenths', () => {
  const sequencer = new Sequencer(150, 0.25)
  sequencer.reset(1)

  const [a, b, c, d] = sequencer.advance(1, 1 + 4 * STEP - 1e-9)
  expect(a.time).toBeCloseTo(1, 9)
  expect(b.time).toBeCloseTo(1 + STEP * 1.25, 9)
  expect(c.time).toBeCloseTo(1 + STEP * 2, 9)
  expect(d.time).toBeCloseTo(1 + STEP * 3.25, 9)
})

test('bars roll over after sixteen steps', () => {
  const sequencer = new Sequencer(150)
  sequencer.reset(0)

  const steps = sequencer.advance(0, (STEPS + 1) * STEP - 1e-9)
  expect(steps.at(-2)).toMatchObject({ step: STEPS - 1, bar: 0 })
  expect(steps.at(-1)).toMatchObject({ step: 0, bar: 1 })
})

test('a stalled scheduler drops the steps it missed and stays on the grid', () => {
  const sequencer = new Sequencer(150)
  sequencer.reset(0)
  sequencer.advance(0, 0.12)

  // A background tab's timer wakes a second late.
  const [first] = sequencer.advance(1.05, 1.17)
  expect(first.time).toBeCloseTo(1.1, 9)
  expect(first.step).toBe(11)
})

test('a tempo change takes effect from the next step', () => {
  const sequencer = new Sequencer(150)
  sequencer.reset(0)
  sequencer.advance(0, 0.05)

  sequencer.bpm = 75
  const [next, after] = sequencer.advance(0.05, 0.35)
  expect(next.time).toBeCloseTo(0.1, 9)
  expect(after.time).toBeCloseTo(0.3, 9)
})

test('patterns read accents, ghost notes and rests', () => {
  expect(pattern('X.x-')).toEqual([1, 0, 0.45, 0])
  expect(midiToHz(69)).toBe(440)
  expect(midiToHz(57)).toBeCloseTo(220, 9)
})
