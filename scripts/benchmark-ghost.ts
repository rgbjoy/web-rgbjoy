import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { GhostCloth, HEAD_Y } from '../src/app/experiments/ghost/cloth'

const pivot = new Vector3(0, HEAD_Y, 0)
const inverse = new Matrix4().makeTranslation(0, -HEAD_Y, 0)
const head = new Matrix4()
const rotation = new Quaternion()
const euler = new Euler()
const scale = new Vector3(1, 1, 1)

for (const quality of ['desktop', 'mobile'] as const) {
  const cloth = new GhostCloth(quality)
  const samples: number[] = []
  try {
    for (let frame = 0; frame < 360; frame++) {
      euler.set(0.08, Math.sin(frame * 0.04) * 0.5, 0, 'YXZ')
      rotation.setFromEuler(euler)
      head.compose(pivot, rotation, scale).multiply(inverse)
      const start = performance.now()
      cloth.update(1 / 60, head, 0.35)
      if (frame >= 120) samples.push(performance.now() - start)
    }
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
    samples.sort((a, b) => a - b)
    console.log(
      `${quality}: ${cloth.positions.length / 3} particles, mean ${mean.toFixed(3)} ms, p95 ${samples[Math.floor(samples.length * 0.95)].toFixed(3)} ms per update at 60 fps`,
    )
  } finally {
    cloth.dispose()
  }
}
