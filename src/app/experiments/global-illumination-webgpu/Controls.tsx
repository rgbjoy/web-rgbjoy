"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import { Raycaster, type Scene, Vector2, type Vector3 } from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { TransformControls } from "three/addons/controls/TransformControls.js"

import { keepInRoom, OBJECTS, pickObject, rotatable, type SceneObject } from "./room"

export type EditMode = "translate" | "rotate"

/** A press that travels further than this, in CSS pixels, is a drag, not a click. */
const CLICK_SLOP = 4

type ControlsProps = {
  /** Where the gizmo and the objects it moves live; drawn over the picture. */
  gizmo: Scene
  selected: SceneObject | null
  mode: EditMode
  onSelect: (name: SceneObject | null) => void
  /** An object moved or turned. */
  onMove: () => void
  home: { position: Vector3; target: Vector3 }
  /** What a click along a ray selects; the room's own objects unless a page adds more to the scene. */
  pick?: (origin: Vector3, direction: Vector3) => SceneObject | null
}

/**
 * Drag to orbit, scroll to dolly in and out of the building, right-drag to
 * pan. Click an object to select it and drag its gizmo to move or turn it;
 * click empty space to let it go.
 */
export function Controls({ gizmo, selected, mode, onSelect, onMove, home, pick = pickObject }: ControlsProps) {
  const camera = useThree((state) => state.camera)
  // `renderer`, not `gl`: the overlay canvas renders with WebGPU, not WebGL.
  const gl = useThree((state) => state.renderer)
  const invalidate = useThree((state) => state.invalidate)

  const orbit = useMemo(() => {
    const controls = new OrbitControls(camera)
    controls.enableDamping = true
    // Settles in a few frames; a long glide just keeps the picture from resolving.
    controls.dampingFactor = 0.25
    controls.minDistance = 0.5
    controls.maxDistance = 40
    return controls
  }, [camera])

  const transform = useMemo(() => {
    const controls = new TransformControls(camera)
    controls.setSize(0.8)
    return controls
  }, [camera])

  useEffect(() => {
    camera.position.copy(home.position)
    orbit.target.copy(home.target)
    orbit.update()
    // Connect in the effect so Strict Mode's cleanup/reconnect stays symmetric.
    orbit.connect(gl.domElement)
    // Wrapped: invalidate's first argument is a frame count, not an event.
    const onChange = () => invalidate()
    orbit.addEventListener("change", onChange)
    return () => {
      orbit.removeEventListener("change", onChange)
      orbit.dispose()
    }
  }, [camera, gl, home, invalidate, orbit])

  useEffect(() => {
    transform.connect(gl.domElement)
    const helper = transform.getHelper()
    gizmo.add(helper)
    // The gizmo wants what it moves in a scene graph; the stand-ins live
    // with it, invisible.
    Object.values(OBJECTS).forEach((object) => gizmo.add(object))

    const onChange = () => invalidate()
    // While a handle is held, dragging moves the object, not the camera.
    const onDragging = (event: { value: unknown }) => {
      orbit.enabled = !event.value
    }
    const onObjectChange = () => {
      const name = (Object.keys(OBJECTS) as SceneObject[]).find((key) => OBJECTS[key] === transform.object)
      if (name) keepInRoom(name, OBJECTS[name].position)
      onMove()
    }
    transform.addEventListener("change", onChange)
    transform.addEventListener("dragging-changed", onDragging)
    transform.addEventListener("objectChange", onObjectChange)
    return () => {
      transform.removeEventListener("change", onChange)
      transform.removeEventListener("dragging-changed", onDragging)
      transform.removeEventListener("objectChange", onObjectChange)
      transform.detach()
      gizmo.remove(helper, ...Object.values(OBJECTS))
      transform.dispose()
    }
  }, [gizmo, gl, invalidate, onMove, orbit, transform])

  useEffect(() => {
    if (selected) transform.attach(OBJECTS[selected])
    else transform.detach()
    invalidate()
  }, [invalidate, selected, transform])

  useEffect(() => {
    transform.setMode(selected && rotatable(selected) ? mode : "translate")
    invalidate()
  }, [invalidate, mode, selected, transform])

  // Registered after the gizmo's own listeners, so a press on a handle is
  // already the gizmo's by the time this hears of it.
  useEffect(() => {
    const canvas = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const objectUnder = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      return pick(raycaster.ray.origin, raycaster.ray.direction)
    }

    let pressed: { x: number; y: number } | null = null
    const onDown = (event: PointerEvent) => {
      pressed = transform.dragging || transform.axis !== null ? null : { x: event.clientX, y: event.clientY }
    }
    const onUp = (event: PointerEvent) => {
      if (!pressed) return
      const travel = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
      pressed = null
      if (travel <= CLICK_SLOP) onSelect(objectUnder(event))
    }
    // The cursor says what a press would do: grab a handle, pick an object, or orbit.
    const onHover = (event: PointerEvent) => {
      if (event.buttons !== 0 || event.pointerType !== "mouse") return
      canvas.style.cursor = transform.axis !== null ? "move" : objectUnder(event) ? "pointer" : ""
    }
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointermove", onHover)
    return () => {
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointermove", onHover)
      canvas.style.cursor = ""
    }
  }, [camera, gl, onSelect, pick, transform])

  // Damping keeps the camera gliding after release; each step of it is a
  // change, and each change asks for the next frame.
  useFrame(() => {
    orbit.update()
  })

  return null
}
