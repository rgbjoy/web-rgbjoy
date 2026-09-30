export type GhostCharge = {
  held: boolean
  level: number
  glow: { value: number }
  time: { value: number }
}

export const CHARGE_HORIZON = '#3b1008'

export function stepCharge(level: number, held: boolean, delta: number) {
  // A hidden tab cannot instantly charge or empty the effect on its return.
  const dt = Math.min(0.1, Math.max(0, delta))
  return Math.max(0, Math.min(1, level + dt * (held ? 1 / 2.4 : -1 / 1.2)))
}
