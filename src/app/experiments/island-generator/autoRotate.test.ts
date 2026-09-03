import { describe, expect, test } from "bun:test"
import { PerspectiveCamera } from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import { AUTO_ROTATE_RESUME_DELAY, AUTO_ROTATE_SPEED, createIdleAutoRotate } from "./autoRotate"

function setup() {
  let now = 0
  const camera = new PerspectiveCamera()
  camera.position.set(30, 25, 37)
  const controls = new OrbitControls(camera)
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED
  const rotation = createIdleAutoRotate(controls, () => now)
  controls.addEventListener("start", rotation.start)
  controls.addEventListener("end", rotation.end)
  return { camera, controls, rotation, setTime: (time: number) => { now = time } }
}

describe("idle island rotation", () => {
  test("rotates on load and immediately pauses for as long as a gesture is held", () => {
    const { camera, controls, rotation, setTime } = setup()
    const initial = camera.position.clone()
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(true)
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0)
    controls.dispatchEvent({ type: "start" })
    expect(controls.autoRotate).toBe(false)
    const held = camera.position.clone()
    setTime(30000)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(false)
    expect(camera.position.distanceTo(held)).toBeLessThan(1e-10)
  })

  test("resumes five seconds after release, not five seconds after touch-down", () => {
    const { controls, rotation, setTime } = setup()
    controls.dispatchEvent({ type: "start" })
    setTime(12000)
    controls.dispatchEvent({ type: "end" })
    setTime(12000 + AUTO_ROTATE_RESUME_DELAY - 1)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(false)
    setTime(12000 + AUTO_ROTATE_RESUME_DELAY)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(true)
  })

  test("repeated wheel events restart the idle countdown", () => {
    const { controls, rotation, setTime } = setup()
    for (const time of [0, 1000, 3500, 8000]) {
      setTime(time)
      controls.dispatchEvent({ type: "start" })
      // OrbitControls also updates synchronously inside its wheel handler.
      controls.update()
      expect(controls.autoRotate).toBe(false)
      controls.dispatchEvent({ type: "end" })
      setTime(time + 1)
      rotation.update(1 / 60)
      expect(controls.autoRotate).toBe(false)
    }
    setTime(12999)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(false)
    setTime(13000)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(true)
  })

  test("another gesture during the countdown pauses until its own final release", () => {
    const { controls, rotation, setTime } = setup()
    controls.dispatchEvent({ type: "start" })
    controls.dispatchEvent({ type: "end" })
    setTime(4900)
    controls.dispatchEvent({ type: "start" })
    // Touch/pinch can emit multiple starts before the final pointer ends.
    controls.dispatchEvent({ type: "start" })
    setTime(10000)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(false)
    controls.dispatchEvent({ type: "end" })
    setTime(14999)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(false)
    setTime(15000)
    rotation.update(1 / 60)
    expect(controls.autoRotate).toBe(true)
  })

  test("rotation speed is independent of refresh rate and long frames are capped", () => {
    const slow = setup()
    const fast = setup()
    for (let frame = 0; frame < 30; frame += 1) slow.rotation.update(1 / 30)
    for (let frame = 0; frame < 120; frame += 1) fast.rotation.update(1 / 120)
    expect(slow.camera.position.distanceTo(fast.camera.position)).toBeLessThan(1e-10)
    const suspended = setup()
    const capped = setup()
    suspended.rotation.update(60)
    capped.rotation.update(0.1)
    expect(suspended.camera.position.distanceTo(capped.camera.position)).toBeLessThan(1e-10)
  })

  test("reduced motion suppresses automatic rotation, but controls keep updating", () => {
    const { camera, controls, rotation } = setup()
    const initial = camera.position.clone()
    rotation.update(1 / 60, true)
    expect(controls.autoRotate).toBe(false)
    expect(camera.position.distanceTo(initial)).toBeLessThan(1e-10)
    controls.rotateLeft(0.1)
    rotation.update(1 / 60, true)
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0)
    rotation.update(1 / 60, false)
    expect(controls.autoRotate).toBe(true)
  })
})
