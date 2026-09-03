import type { OrbitControls } from "three/addons/controls/OrbitControls.js"

export const AUTO_ROTATE_RESUME_DELAY = 5000
export const AUTO_ROTATE_SPEED = 0.35

/** No timers: the live frame loop resumes rotation after the last gesture ends. */
export function createIdleAutoRotate(
  controls: Pick<OrbitControls, "autoRotate" | "update">,
  now: () => number = () => performance.now(),
) {
  let interacting = false
  let resumeAt = 0

  return {
    start() {
      interacting = true
      // Wheel handlers also call update() synchronously, before the next frame.
      controls.autoRotate = false
    },
    end() {
      interacting = false
      resumeAt = now() + AUTO_ROTATE_RESUME_DELAY
      controls.autoRotate = false
    },
    update(delta: number, reducedMotion = false) {
      controls.autoRotate = !reducedMotion && !interacting && now() >= resumeAt
      // Frame-rate independent, without jumping when a background tab returns.
      controls.update(Math.min(delta, 0.1))
    },
  }
}
